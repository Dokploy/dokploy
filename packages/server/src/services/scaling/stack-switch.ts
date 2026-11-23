import { db } from "@dokploy/server/db";
import { compose as composeTable } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";
import { quote } from "shell-quote";
import type {
	ComposeSpecification,
	DefinitionsService,
} from "../../utils/docker/types";
import { execAsync, execAsyncRemote } from "../../utils/process/execAsync";
import { hasFixedHostPort } from "./compose-overrides";
import { readComposeSnapshot } from "./compose-snapshot";
import { readSourceSpec, type ScalableCompose } from "./compose-status";
import { composeScaleLockKey, isDeploying, withScaleLock } from "./scale-lock";
import { ScaleRejectedError } from "./scale-service";

export interface CompatibilityIssue {
	serviceName: string;
	severity: "blocking" | "warning";
	message: string;
}

const volumeSources = (service: DefinitionsService) =>
	(service.volumes ?? []).map((volume) =>
		typeof volume === "string"
			? (volume.split(":")[0] ?? "")
			: (volume.source ?? ""),
	);

/**
 * What changes when a Docker Compose file is deployed with `docker stack
 * deploy` instead. Blocking issues stop the switch; warnings describe
 * options Swarm ignores or behaves differently with.
 */
export const checkStackCompatibility = (
	spec: ComposeSpecification,
): CompatibilityIssue[] => {
	const issues: CompatibilityIssue[] = [];
	for (const [serviceName, service] of Object.entries(spec.services ?? {})) {
		if (!service) continue;
		const add = (severity: CompatibilityIssue["severity"], message: string) =>
			issues.push({ serviceName, severity, message });

		if (service.build && !service.image) {
			add(
				"blocking",
				"It builds its image, which docker stack deploy ignores. Push the image to a registry and set image: instead.",
			);
		} else if (service.build) {
			add(
				"warning",
				`docker stack deploy ignores build: and pulls ${service.image} from its registry, so it must be pushed there.`,
			);
		}
		if (service.network_mode) {
			add(
				"blocking",
				`network_mode: ${service.network_mode} is not supported by Swarm services.`,
			);
		}
		if (service.privileged) {
			add("warning", "privileged: is ignored by Swarm services.");
		}
		if (service.container_name) {
			add(
				"warning",
				"container_name is ignored; Swarm names the containers itself.",
			);
		}
		if (service.depends_on) {
			add(
				"warning",
				"depends_on is ignored, so services may start in any order. Make them retry their connections.",
			);
		}
		if (service.links) {
			add(
				"warning",
				"links is ignored; services still reach each other by service name.",
			);
		}
		if (service.restart) {
			add(
				"warning",
				"restart is ignored. Swarm restarts failed containers by default; set deploy.restart_policy to change that.",
			);
		}
		if (hasFixedHostPort(service.ports)) {
			add(
				"warning",
				"Its published ports are opened on every node of the swarm (routing mesh), not just this server.",
			);
		}
		const sources = volumeSources(service);
		if (sources.some((source) => /^[./~]/.test(source))) {
			add(
				"warning",
				"It bind-mounts files from this server, which exist only here. Pin it to this server, or the files must exist on every node.",
			);
		}
		if (sources.some((source) => source && !/^[./~]/.test(source))) {
			add(
				"warning",
				"Its named volumes keep the data already on this server, but a volume exists on one node only. Pin it to this server (node.role == manager) so it keeps its data.",
			);
		}
	}
	return issues;
};

export const readComposeSpecForSwitch = async (compose: ScalableCompose) =>
	(await readComposeSnapshot(compose))?.spec ?? (await readSourceSpec(compose));

const run = (compose: ScalableCompose, command: string) =>
	compose.serverId
		? execAsyncRemote(compose.serverId, command)
		: execAsync(command);

/**
 * Takes the plain Compose project down (keeping volumes, which the stack
 * reuses because both are named `<appName>_<volume>`) and changes the type.
 * The caller queues the first stack deploy.
 */
export const switchComposeToStack = async ({
	compose,
	acknowledgeWarnings,
}: {
	compose: ScalableCompose & { isolatedDeployment?: boolean };
	acknowledgeWarnings: boolean;
}) => {
	if (compose.composeType !== "docker-compose") {
		throw new ScaleRejectedError(
			"unsupported_mode",
			"This compose already runs as a Stack.",
		);
	}
	if (compose.command) {
		throw new ScaleRejectedError(
			"custom_command",
			"This compose deploys with a custom command. Remove it in Advanced before switching, so Dokploy can run docker stack deploy.",
		);
	}
	const key = composeScaleLockKey(compose.composeId);
	if (compose.composeStatus === "running" || (await isDeploying(key))) {
		throw new ScaleRejectedError(
			"deployment_in_progress",
			"A deployment is in progress. Try again once it finishes.",
		);
	}
	const spec = await readComposeSpecForSwitch(compose);
	if (!spec) {
		throw new ScaleRejectedError(
			"unknown_service",
			"Dokploy cannot read this compose file. Deploy it once, then switch.",
		);
	}
	const issues = checkStackCompatibility(spec);
	const blocking = issues.filter((issue) => issue.severity === "blocking");
	if (blocking.length > 0) {
		throw new ScaleRejectedError(
			"incompatible",
			`Fix these first: ${blocking.map((issue) => `${issue.serviceName}: ${issue.message}`).join(" ")}`,
		);
	}
	if (issues.length > 0 && !acknowledgeWarnings) {
		throw new ScaleRejectedError(
			"confirmation_required",
			"Review the listed changes and confirm the switch.",
		);
	}

	return withScaleLock(key, async () => {
		const project = quote([compose.appName]);
		await run(
			compose,
			`env -i PATH="$PATH" HOME="$HOME" docker compose -p ${project} down --remove-orphans`,
		);
		if (compose.isolatedDeployment) {
			// The plain-Compose run left a local bridge network with the name
			// the stack needs for its overlay network.
			await run(
				compose,
				`docker network disconnect ${project} dokploy-traefik >/dev/null 2>&1 || true; docker network rm ${project} >/dev/null 2>&1 || true`,
			);
		}
		await db
			.update(composeTable)
			.set({ composeType: "stack", composeStatus: "idle" })
			.where(eq(composeTable.composeId, compose.composeId));
		return { issues };
	});
};

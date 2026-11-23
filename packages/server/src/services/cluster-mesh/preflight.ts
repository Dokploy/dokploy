import { db } from "@dokploy/server/db";
import { applications, compose } from "@dokploy/server/db/schema";
import { eq, isNull } from "drizzle-orm";
import type { DefinitionsService } from "../../utils/docker/types";
import { readComposeSnapshot } from "../scaling/compose-snapshot";
import { readSourceSpec } from "../scaling/compose-status";

export interface PreflightFinding {
	kind: "application" | "compose";
	id: string;
	name: string;
	serviceName: string | null;
	reason: string;
	href: string;
}

const PIN_PREFIXES = ["node.hostname==", "node.id=="];

/** Whether Swarm can only place the service on a fixed node or on managers. */
export const isPinned = (constraints: string[]) =>
	constraints.some((raw) => {
		const constraint = raw.replace(/\s+/g, "");
		return (
			constraint === "node.role==manager" ||
			PIN_PREFIXES.some((prefix) => constraint.startsWith(prefix))
		);
	});

const applicationHref = (app: {
	applicationId: string;
	environmentId: string;
	environment: { projectId: string };
}) =>
	`/dashboard/project/${app.environment.projectId}/environment/${app.environmentId}/services/application/${app.applicationId}`;

const composeHref = (item: {
	composeId: string;
	environmentId: string;
	environment: { projectId: string };
}) =>
	`/dashboard/project/${item.environment.projectId}/environment/${item.environmentId}/services/compose/${item.composeId}`;

const usesNamedVolume = (service: DefinitionsService) =>
	(service.volumes ?? []).some((volume) => {
		if (typeof volume === "string") {
			const source = volume.split(":")[0] ?? "";
			return volume.includes(":") && !/^[./~]/.test(source);
		}
		return volume.type === "volume" && !!volume.source;
	});

/**
 * What would break once Swarm may place tasks on a new VM: images that only
 * exist on the build host, and data in named volumes, which live on one node.
 * Services already pinned to a node or to managers are left alone.
 */
export const findClusterPreflightIssues = async ({
	serverId,
	organizationId,
}: {
	serverId: string | null;
	organizationId: string;
}): Promise<PreflightFinding[]> => {
	const findings: PreflightFinding[] = [];

	const apps = await db.query.applications.findMany({
		where: serverId
			? eq(applications.serverId, serverId)
			: isNull(applications.serverId),
		with: { mounts: true, environment: { with: { project: true } } },
	});
	for (const app of apps) {
		if (app.environment.project.organizationId !== organizationId) continue;
		const constraints = app.placementSwarm?.Constraints ?? [];
		// Apps with mounts and no placement get Dokploy's manager pin.
		const pinned =
			isPinned(constraints) || (!app.placementSwarm && app.mounts.length > 0);
		if (pinned) continue;
		const base = {
			kind: "application" as const,
			id: app.applicationId,
			name: app.name,
			serviceName: null,
			href: applicationHref(app),
		};
		if (
			app.sourceType !== "docker" &&
			!app.registryId &&
			!app.buildRegistryId
		) {
			findings.push({
				...base,
				reason:
					"Its image is built on the manager and not pushed to a registry, so replicas placed on another VM cannot start. Set a registry in Advanced → Cluster Settings, or pin it to manager nodes in Scaling → Placement.",
			});
		}
		if (app.mounts.some((mount) => mount.type === "volume")) {
			findings.push({
				...base,
				reason:
					"It stores data in a named volume, which exists on one node only. Pin it to its current node in Scaling → Placement.",
			});
		}
	}

	const stacks = await db.query.compose.findMany({
		where: serverId ? eq(compose.serverId, serverId) : isNull(compose.serverId),
		with: { environment: { with: { project: true } } },
	});
	for (const stack of stacks) {
		if (stack.composeType !== "stack") continue;
		if (stack.environment.project.organizationId !== organizationId) continue;
		const spec =
			(await readComposeSnapshot(stack))?.spec ?? (await readSourceSpec(stack));
		for (const [serviceName, service] of Object.entries(spec?.services ?? {})) {
			if (!service) continue;
			if (isPinned(service.deploy?.placement?.constraints ?? [])) continue;
			const base = {
				kind: "compose" as const,
				id: stack.composeId,
				name: stack.name,
				serviceName,
				href: composeHref(stack),
			};
			if (service.build) {
				findings.push({
					...base,
					reason:
						"It builds its image, which docker stack deploy ignores; another VM can only run it from an image in a registry.",
				});
			}
			if (usesNamedVolume(service)) {
				findings.push({
					...base,
					reason:
						"It uses a named volume, which exists on one node only. Add a placement constraint (for example node.role == manager) in the compose file.",
				});
			}
		}
	}
	return findings;
};

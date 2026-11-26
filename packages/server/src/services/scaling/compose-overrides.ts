import { db } from "@dokploy/server/db";
import {
	type ComposeServicePlacement,
	composeServiceScaling,
	type PlacementSwarm,
} from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";
import type {
	ComposeSpecification,
	DefinitionsService,
} from "../../utils/docker/types";
import type { ServiceMode } from "./replicas";
import {
	applyPlacementSelection,
	type PlacementSettings,
	readPlacementSettings,
} from "./scaling-settings";

export type ComposeType = "docker-compose" | "stack";

export interface ReplicaOverride {
	serviceName: string;
	/** Null when only the placement is overridden. */
	replicas: number | null;
	/** Stack only; plain Compose has a single host to place on. */
	placement?: ComposeServicePlacement | null;
}

export interface ComposeServiceDescription {
	mode: ServiceMode;
	fileReplicas: number;
	/** Why a plain-compose service cannot run more than one container. */
	singleInstanceReasons: string[];
	hasHealthCheck: boolean;
}

const MODES = new Set<ServiceMode>([
	"replicated",
	"global",
	"replicated-job",
	"global-job",
]);

const modeOf = (service: DefinitionsService): ServiceMode => {
	const mode = service.deploy?.mode;
	return mode && MODES.has(mode as ServiceMode)
		? (mode as ServiceMode)
		: "replicated";
};

// Compose reads `scale` before `deploy.replicas` (compose-go GetScale).
const fileReplicasOf = (service: DefinitionsService) =>
	service.scale ?? service.deploy?.replicas ?? 1;

const stripHostIp = (port: string) => {
	if (port.startsWith("[")) {
		const end = port.indexOf("]:");
		return end === -1 ? port : port.slice(end + 2);
	}
	const parts = port.split(":");
	return parts.length === 3 ? parts.slice(1).join(":") : port;
};

/**
 * A host port that is a single number can be bound by one container only.
 * Ports without a host side, or with a host range, let Docker pick a free
 * host port per container.
 */
export const hasFixedHostPort = (ports: DefinitionsService["ports"]): boolean =>
	(ports ?? []).some((port) => {
		if (typeof port === "number") return false;
		if (typeof port === "string") {
			const withoutProtocol = port.split("/")[0] ?? "";
			const mapping = stripHostIp(withoutProtocol);
			const separator = mapping.lastIndexOf(":");
			if (separator === -1) return false;
			const host = mapping.slice(0, separator);
			return host !== "" && !host.includes("-");
		}
		const published = port.published;
		if (published === undefined || published === "") return false;
		return !String(published).includes("-");
	});

const hasStaticIp = (networks: DefinitionsService["networks"]) => {
	if (!networks || Array.isArray(networks)) return false;
	return Object.values(networks).some(
		(network) =>
			!!network &&
			typeof network === "object" &&
			("ipv4_address" in network || "ipv6_address" in network),
	);
};

const hasHealthCheck = (service: DefinitionsService) => {
	const check = service.healthcheck;
	if (!check || check.disable) return false;
	const test = check.test;
	if (Array.isArray(test)) return test.length > 0 && test[0] !== "NONE";
	return typeof test === "string" ? test.length > 0 : true;
};

export const describeComposeService = (
	service: DefinitionsService,
	composeType: ComposeType,
): ComposeServiceDescription => {
	const singleInstanceReasons: string[] = [];
	if (composeType === "docker-compose") {
		if (service.container_name) {
			singleInstanceReasons.push(
				`It sets container_name "${service.container_name}", and container names must be unique.`,
			);
		}
		if (hasFixedHostPort(service.ports)) {
			singleInstanceReasons.push(
				"It publishes a fixed host port, which only one container can bind.",
			);
		}
		if (service.network_mode === "host") {
			singleInstanceReasons.push(
				"It uses host networking, so every container would need the same ports.",
			);
		}
		if (hasStaticIp(service.networks)) {
			singleInstanceReasons.push(
				"It assigns a static IP address, which only one container can use.",
			);
		}
	}
	return {
		mode: modeOf(service),
		fileReplicas: fileReplicasOf(service),
		singleInstanceReasons,
		hasHealthCheck: hasHealthCheck(service),
	};
};

export interface OverrideOutcome extends ReplicaOverride {
	applied: boolean;
	reason: string | null;
}

type FilePlacement = NonNullable<
	NonNullable<DefinitionsService["deploy"]>["placement"]
>;

/** The compose file's `deploy.placement` in Swarm's shape, and back. */
export const fromFilePlacement = (
	placement: FilePlacement | undefined,
): PlacementSwarm | null => {
	if (!placement) return null;
	return {
		Constraints: placement.constraints ?? [],
		...(placement.preferences && {
			Preferences: placement.preferences
				.filter((preference) => preference.spread)
				.map((preference) => ({
					Spread: { SpreadDescriptor: preference.spread as string },
				})),
		}),
		...(placement.max_replicas_per_node && {
			MaxReplicas: placement.max_replicas_per_node,
		}),
	};
};

const toFilePlacement = (placement: PlacementSwarm): FilePlacement => ({
	...(placement.Constraints?.length && { constraints: placement.Constraints }),
	...(placement.Preferences?.length && {
		preferences: placement.Preferences.map((preference) => ({
			spread: preference.Spread.SpreadDescriptor,
		})),
	}),
	...(placement.MaxReplicas && {
		max_replicas_per_node: placement.MaxReplicas,
	}),
});

/** Placement as the Scaling tab shows it: saved override over the file. */
export const readServicePlacement = (
	service: DefinitionsService | undefined,
	override: ComposeServicePlacement | null | undefined,
): PlacementSettings => {
	const file = fromFilePlacement(service?.deploy?.placement);
	const effective = override ? applyPlacementSelection(file, override) : file;
	return readPlacementSettings(effective ?? { Constraints: [] }, false);
};

const skipped = (
	override: ReplicaOverride,
	reason: string,
): OverrideOutcome => ({
	...override,
	applied: false,
	reason,
});

/**
 * Writes saved replica counts and placement into a compose spec. A value the
 * file cannot express is skipped with the reason rather than failing the
 * deploy.
 */
export const applyReplicaOverrides = (
	spec: ComposeSpecification,
	overrides: ReplicaOverride[],
	composeType: ComposeType,
): OverrideOutcome[] =>
	overrides.map((override) => {
		const service = spec.services?.[override.serviceName];
		if (!service) {
			return skipped(override, "The service is no longer in the compose file.");
		}
		const description = describeComposeService(service, composeType);
		if (override.placement && composeType === "stack") {
			const placement = applyPlacementSelection(
				fromFilePlacement(service.deploy?.placement),
				override.placement,
			);
			service.deploy = {
				...service.deploy,
				placement: toFilePlacement(placement),
			};
		}
		if (override.replicas === null) {
			return { ...override, applied: true, reason: null };
		}
		if (description.mode !== "replicated") {
			return skipped(override, `The service runs in ${description.mode} mode.`);
		}
		if (override.replicas > 1 && description.singleInstanceReasons.length > 0) {
			return skipped(override, description.singleInstanceReasons.join(" "));
		}
		// Compose refuses a file whose `scale` and `deploy.replicas` differ.
		delete service.scale;
		service.deploy = { ...service.deploy, replicas: override.replicas };
		return { ...override, applied: true, reason: null };
	});

export const findComposeReplicaOverrides = async (
	composeId: string,
): Promise<ReplicaOverride[]> =>
	(
		await db.query.composeServiceScaling.findMany({
			where: eq(composeServiceScaling.composeId, composeId),
			columns: { serviceName: true, replicas: true, placement: true },
		})
	).map(({ serviceName, replicas, placement }) => ({
		serviceName,
		replicas,
		placement,
	}));

export const saveComposeReplicaOverride = async ({
	composeId,
	serviceName,
	replicas,
}: {
	composeId: string;
	serviceName: string;
	replicas: number;
}) => {
	await db
		.insert(composeServiceScaling)
		.values({ composeId, serviceName, replicas, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: [
				composeServiceScaling.composeId,
				composeServiceScaling.serviceName,
			],
			set: { replicas, updatedAt: new Date() },
		});
};

export const saveComposePlacementOverride = async ({
	composeId,
	serviceName,
	placement,
}: {
	composeId: string;
	serviceName: string;
	placement: ComposeServicePlacement;
}) => {
	await db
		.insert(composeServiceScaling)
		.values({ composeId, serviceName, placement, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: [
				composeServiceScaling.composeId,
				composeServiceScaling.serviceName,
			],
			set: { placement, updatedAt: new Date() },
		});
};

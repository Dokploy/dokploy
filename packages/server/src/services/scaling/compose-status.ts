import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { ContainerInfo } from "dockerode";
import { quote } from "shell-quote";
import { parse } from "yaml";
import { randomizeSpecificationFile } from "../../utils/docker/compose";
import type { ServiceInspectInfo } from "../../utils/docker/swarm-service";
import type { ComposeSpecification } from "../../utils/docker/types";
import { execAsyncRemote } from "../../utils/process/execAsync";
import {
	type ComposeServiceDescription,
	type ComposeType,
	describeComposeService,
	findComposeReplicaOverrides,
	type ReplicaOverride,
	readServicePlacement,
} from "./compose-overrides";
import { readComposeSnapshot, type SnapshotCompose } from "./compose-snapshot";
import { diagnoseFailures } from "./failure-diagnosis";
import type { ServiceMode } from "./replicas";
import type { PlacementSettings } from "./scaling-settings";
import { emptySummary, getScalingDocker, liveServiceMode } from "./status";
import {
	explainFailure,
	type ReplicaInfo,
	type ReplicaPhase,
	type ReplicaSummary,
	ROLLOUT_IN_PROGRESS_STATES,
	type SwarmNode,
	type SwarmTask,
	summarizeReplicas,
} from "./task-status";
import { createTtlCache } from "./ttl-cache";

export interface ScalableCompose extends SnapshotCompose {
	composeId: string;
	composeStatus: "idle" | "running" | "done" | "error";
	server?: { sshKeyId: string | null } | null;
	composeFile?: string;
	randomize?: boolean;
	suffix?: string;
}

export interface ComposeServiceStatus extends ReplicaSummary {
	serviceName: string;
	mode: ServiceMode;
	deployed: boolean;
	configured: number;
	overridden: boolean;
	desired: number | null;
	stopped: boolean;
	inSync: boolean;
	rolloutInProgress: boolean;
	updateStatus: { state: string | null; message: string | null } | null;
	healthCheck: boolean;
	singleInstanceReasons: string[];
	/** Set when a saved count cannot be written into the compose file. */
	overrideNotApplied: string | null;
	disabledReason: string | null;
	/** Stack services only: the saved placement over the compose file's. */
	placement: PlacementSettings | null;
}

export interface ComposeScalingStatus {
	serverId: string | null;
	composeType: ComposeType;
	composeStatus: ScalableCompose["composeStatus"];
	customCommand: boolean;
	snapshot: boolean;
	services: ComposeServiceStatus[];
}

export const stackServiceName = (appName: string, serviceName: string) =>
	`${appName}_${serviceName}`;

const LABEL_PROJECT = "com.docker.compose.project";
const LABEL_SERVICE = "com.docker.compose.service";
const LABEL_NUMBER = "com.docker.compose.container-number";
const LABEL_ONEOFF = "com.docker.compose.oneoff";

type ContainerHealth = "none" | "starting" | "healthy" | "unhealthy";

// The container list only carries health inside the human-readable status.
const healthOf = (status: string): ContainerHealth => {
	if (status.includes("(health: starting)")) return "starting";
	if (status.includes("(unhealthy)")) return "unhealthy";
	if (status.includes("(healthy)")) return "healthy";
	return "none";
};

const exitCodeOf = (status: string) => {
	const match = /^Exited \((-?\d+)\)/.exec(status);
	return match ? Number(match[1]) : null;
};

/**
 * Traefik's docker provider only routes to running containers whose health
 * is healthy or not checked, so "ready" uses the same rule.
 */
export const classifyContainer = (
	container: Pick<ContainerInfo, "State" | "Status">,
): ReplicaPhase => {
	const status = container.Status ?? "";
	switch (container.State) {
		case "running": {
			const health = healthOf(status);
			if (health === "starting") return "starting";
			if (health === "unhealthy") return "failed";
			return "ready";
		}
		case "created":
			return "starting";
		case "restarting":
		case "dead":
			return "failed";
		case "removing":
			return "stopping";
		case "exited": {
			const code = exitCodeOf(status);
			return code !== null && code !== 0 ? "failed" : "stopped";
		}
		default:
			return "stopped";
	}
};

export const containerToReplica = (container: ContainerInfo): ReplicaInfo => {
	const phase = classifyContainer(container);
	const number = Number(container.Labels?.[LABEL_NUMBER]);
	const status = container.Status ?? "";
	const unhealthy = container.State === "running" && phase === "failed";
	const exitCode = container.State === "exited" ? exitCodeOf(status) : null;
	return {
		taskId: container.Id,
		slot: Number.isInteger(number) && number > 0 ? number : null,
		phase,
		state: container.State,
		desiredState: container.State === "running" ? "running" : "shutdown",
		message: status || null,
		error: unhealthy
			? "Unhealthy: Traefik does not send it traffic."
			: phase === "failed"
				? status
				: null,
		cause:
			phase === "failed" && !unhealthy
				? explainFailure({ error: null, exitCode, container: null })
				: null,
		exitCode,
		containerId: container.Id,
		since: container.Created
			? new Date(container.Created * 1000).toISOString()
			: null,
		receivesTraffic: phase === "ready",
		node: null,
	};
};

export const summarizeContainers = (
	containers: ContainerInfo[],
): ReplicaSummary => {
	const replicas = containers
		.map(containerToReplica)
		.sort(
			(a, b) =>
				(a.slot ?? Number.MAX_SAFE_INTEGER) -
				(b.slot ?? Number.MAX_SAFE_INTEGER),
		);
	const count = (phase: ReplicaPhase) =>
		replicas.filter((replica) => replica.phase === phase).length;
	return {
		replicas,
		recentFailures: [],
		counts: {
			ready: count("ready"),
			starting: count("starting"),
			pending: 0,
			stopping: count("stopping"),
			failedRecent: count("failed"),
		},
		pendingReasons: [],
		distribution: [],
	};
};

type Descriptions = Map<string, ComposeServiceDescription>;

const describeAll = (
	spec: ComposeSpecification | null,
	composeType: ComposeType,
): Descriptions => {
	const descriptions: Descriptions = new Map();
	for (const [name, service] of Object.entries(spec?.services ?? {})) {
		if (service) {
			descriptions.set(name, describeComposeService(service, composeType));
		}
	}
	return descriptions;
};

const parseSpec = (yaml: string | undefined) => {
	if (!yaml) return null;
	const spec = parse(yaml, {
		maxAliasCount: 10000,
		merge: true,
	}) as ComposeSpecification | null;
	return spec && typeof spec === "object" ? spec : null;
};

/**
 * The compose file as saved or cloned, before any deploy succeeded. Lets the
 * tab list services (and what keeps one from scaling) before the first deploy.
 * Names get the same suffix as at deploy, so they match saved counts.
 */
export const readSourceSpec = async (
	compose: ScalableCompose,
): Promise<ComposeSpecification | null> => {
	try {
		let spec: ComposeSpecification | null;
		if (compose.sourceType === "raw") {
			spec = parseSpec(compose.composeFile);
		} else {
			const { COMPOSE_PATH } = paths(!!compose.serverId);
			const file = join(
				COMPOSE_PATH,
				compose.appName,
				"code",
				compose.composePath,
			);
			if (compose.serverId) {
				const { stdout } = await execAsyncRemote(
					compose.serverId,
					`if [ -f ${quote([file])} ]; then cat ${quote([file])}; fi`,
				);
				spec = parseSpec(stdout);
			} else {
				spec = existsSync(file) ? parseSpec(readFileSync(file, "utf8")) : null;
			}
		}
		return spec && compose.randomize
			? randomizeSpecificationFile(spec, compose.suffix)
			: spec;
	} catch (error) {
		console.error(`Unreadable compose file for ${compose.appName}`, error);
		return null;
	}
};

const overrideNotApplied = (
	override: ReplicaOverride | undefined,
	description: ComposeServiceDescription | undefined,
) => {
	if (!override || override.replicas === null || !description) return null;
	if (description.mode !== "replicated") {
		return `The saved count is not used: the service runs in ${description.mode} mode.`;
	}
	if (override.replicas > 1 && description.singleInstanceReasons.length > 0) {
		return `The saved count of ${override.replicas} is not used. ${description.singleInstanceReasons.join(" ")}`;
	}
	return null;
};

const commonDisabledReason = (compose: ScalableCompose) => {
	if (compose.command) {
		return "This compose deploys with a custom command, so Dokploy cannot tell which files and project it uses. Set replicas in the compose file instead.";
	}
	if (compose.composeStatus === "running") {
		return "A deployment is in progress. Scaling is available again once it finishes.";
	}
	return null;
};

interface ServiceInput {
	serviceName: string;
	description: ComposeServiceDescription | undefined;
	override: ReplicaOverride | undefined;
	compose: ScalableCompose;
}

const disabledReasonFor = (
	compose: ScalableCompose,
	mode: ServiceMode,
	rolloutInProgress = false,
) => {
	const common = commonDisabledReason(compose);
	if (common) return common;
	if (mode !== "replicated") {
		return `The replica count does not apply to services in ${mode} mode.`;
	}
	return rolloutInProgress
		? "A rollout is in progress. Scaling is available again once it finishes."
		: null;
};

const baseStatus = ({
	serviceName,
	description,
	override,
	compose,
}: ServiceInput) => {
	const mode = description?.mode ?? "replicated";
	return {
		serviceName,
		mode,
		overridden: override?.replicas != null,
		healthCheck: description?.hasHealthCheck ?? false,
		singleInstanceReasons: description?.singleInstanceReasons ?? [],
		overrideNotApplied: overrideNotApplied(override, description),
		disabledReason: disabledReasonFor(compose, mode),
	};
};

const stackStatus = async (
	compose: ScalableCompose,
	descriptions: Descriptions,
	spec: ComposeSpecification | null,
	overrides: ReplicaOverride[],
	now: number,
): Promise<ComposeServiceStatus[]> => {
	const docker = await getScalingDocker(compose);
	const services = (await docker.listServices({
		filters: JSON.stringify({
			label: [`com.docker.stack.namespace=${compose.appName}`],
		}),
	})) as ServiceInspectInfo[];
	const prefix = `${compose.appName}_`;
	const liveByName = new Map(
		services
			.filter((service) => service.Spec?.Name?.startsWith(prefix))
			.map((service) => [
				(service.Spec?.Name as string).slice(prefix.length),
				service,
			]),
	);
	const [tasks, nodes] = await Promise.all([
		liveByName.size > 0
			? (docker.listTasks({
					filters: JSON.stringify({
						service: [...liveByName.values()].map((service) => service.ID),
					}),
				}) as Promise<SwarmTask[]>)
			: Promise.resolve([]),
		(docker.listNodes() as Promise<SwarmNode[]>).catch(() => []),
	]);

	const names = new Set([...descriptions.keys(), ...liveByName.keys()]);
	const statuses = [...names].sort().map((serviceName) => {
		const description = descriptions.get(serviceName);
		const override = overrides.find((o) => o.serviceName === serviceName);
		const live = liveByName.get(serviceName);
		const base = {
			...baseStatus({ serviceName, description, override, compose }),
			placement: readServicePlacement(
				spec?.services?.[serviceName],
				override?.placement,
			),
		};
		if (!live) {
			const configured = override?.replicas ?? description?.fileReplicas ?? 1;
			return {
				...emptySummary(),
				...base,
				deployed: false,
				configured,
				desired: null,
				stopped: false,
				inSync: true,
				rolloutInProgress: false,
				updateStatus: null,
			};
		}
		const replicated = live.Spec?.Mode?.Replicated;
		const desired: number | null = replicated
			? (replicated.Replicas ?? 1)
			: null;
		const configured =
			override?.replicas ?? description?.fileReplicas ?? desired ?? 1;
		const updateState: string | null = live.UpdateStatus?.State ?? null;
		const rolloutInProgress =
			!!updateState && ROLLOUT_IN_PROGRESS_STATES.has(updateState);
		const mode = liveServiceMode(live.Spec);
		const liveHealthCheck =
			!!live.Spec?.TaskTemplate?.ContainerSpec?.Healthcheck?.Test?.length;
		return {
			...summarizeReplicas({
				tasks: tasks.filter((task) => task.ServiceID === live.ID),
				nodes,
				now,
			}),
			...base,
			mode,
			disabledReason: disabledReasonFor(compose, mode, rolloutInProgress),
			healthCheck: base.healthCheck || liveHealthCheck,
			deployed: true,
			configured,
			desired,
			stopped: desired === 0,
			inSync: desired === null || desired === 0 || desired === configured,
			rolloutInProgress,
			updateStatus: live.UpdateStatus
				? { state: updateState, message: live.UpdateStatus.Message ?? null }
				: null,
		};
	});
	return Promise.all(
		statuses.map(async (status) => ({
			...status,
			recentFailures: await diagnoseFailures(docker, status.recentFailures),
		})),
	);
};

const plainComposeStatus = async (
	compose: ScalableCompose,
	descriptions: Descriptions,
	overrides: ReplicaOverride[],
): Promise<ComposeServiceStatus[]> => {
	const docker = await getScalingDocker(compose);
	const containers = (
		await docker.listContainers({
			all: true,
			filters: JSON.stringify({
				label: [`${LABEL_PROJECT}=${compose.appName}`],
			}),
		})
	).filter((container) => container.Labels?.[LABEL_ONEOFF] !== "True");
	const byService = new Map<string, ContainerInfo[]>();
	for (const container of containers) {
		const name = container.Labels?.[LABEL_SERVICE];
		if (!name) continue;
		byService.set(name, [...(byService.get(name) ?? []), container]);
	}

	const names = new Set([...descriptions.keys(), ...byService.keys()]);
	return [...names].sort().map((serviceName) => {
		const description = descriptions.get(serviceName);
		const override = overrides.find((o) => o.serviceName === serviceName);
		const serviceContainers = byService.get(serviceName) ?? [];
		const summary = summarizeContainers(serviceContainers);
		const running = serviceContainers.filter(
			(container) => container.State === "running",
		).length;
		const snapshotReplicas = description?.fileReplicas ?? null;
		const configured =
			override?.replicas ?? snapshotReplicas ?? serviceContainers.length;
		// Compose keeps no desired count; the snapshot (or, before the first
		// snapshot, the compose file) holds what the last deploy asked for.
		const desired = serviceContainers.length > 0 ? snapshotReplicas : null;
		const stopped = serviceContainers.length > 0 && running === 0;
		return {
			...summary,
			...baseStatus({ serviceName, description, override, compose }),
			placement: null,
			deployed: serviceContainers.length > 0,
			configured,
			desired,
			stopped,
			inSync: desired === null || stopped || desired === configured,
			rolloutInProgress: false,
			updateStatus: null,
		};
	});
};

export const getComposeScalingStatus = async (
	compose: ScalableCompose,
	{ now = Date.now() }: { now?: number } = {},
): Promise<ComposeScalingStatus> => {
	const [snapshot, overrides] = await Promise.all([
		readComposeSnapshot(compose),
		findComposeReplicaOverrides(compose.composeId),
	]);
	const spec = snapshot?.spec ?? (await readSourceSpec(compose));
	const descriptions = describeAll(spec, compose.composeType);
	const services =
		compose.composeType === "stack"
			? await stackStatus(compose, descriptions, spec, overrides, now)
			: await plainComposeStatus(compose, descriptions, overrides);
	return {
		serverId: compose.serverId,
		composeType: compose.composeType,
		composeStatus: compose.composeStatus,
		customCommand: !!compose.command,
		snapshot: !!snapshot,
		services,
	};
};

const statusCache = createTtlCache<ComposeScalingStatus>(3_000);

export const getCachedComposeScalingStatus = (compose: ScalableCompose) =>
	statusCache.get(compose.composeId, () => getComposeScalingStatus(compose));

export const invalidateComposeScalingStatus = (composeId: string) => {
	statusCache.delete(composeId);
};

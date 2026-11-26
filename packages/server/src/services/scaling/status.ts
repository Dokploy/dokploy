import type {
	HealthCheckSwarm,
	ServiceModeSwarm,
} from "@dokploy/server/db/schema";
import {
	isDockerNotFoundError,
	type ServiceInspectInfo,
} from "../../utils/docker/swarm-service";
import { getRemoteDocker } from "../../utils/servers/remote-docker";
import { diagnoseFailures } from "./failure-diagnosis";
import {
	getConfiguredReplicas,
	getServiceMode,
	type ServiceMode,
} from "./replicas";
import {
	type ReplicaSummary,
	ROLLOUT_IN_PROGRESS_STATES,
	type SwarmNode,
	type SwarmTask,
	summarizeReplicas,
} from "./task-status";
import { createTtlCache } from "./ttl-cache";

export interface ScalableApplication {
	applicationId: string;
	appName: string;
	serverId: string | null;
	replicas: number;
	modeSwarm: ServiceModeSwarm | null;
	healthCheckSwarm: HealthCheckSwarm | null;
	server?: { sshKeyId: string | null } | null;
}

export class ScalingServerUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ScalingServerUnavailableError";
	}
}

export interface ScalingStatus extends ReplicaSummary {
	deployed: boolean;
	mode: ServiceMode;
	configured: number;
	desired: number | null;
	stopped: boolean;
	inSync: boolean;
	rolloutInProgress: boolean;
	updateStatus: {
		state: string | null;
		message: string | null;
		startedAt: string | null;
		completedAt: string | null;
	} | null;
	dokployHealthCheck: boolean;
}

export const getScalingDocker = async (
	target: Pick<ScalableApplication, "serverId" | "server">,
) => {
	// getRemoteDocker falls back to the local daemon when a server has no SSH
	// key, which would report on (and scale) the wrong host.
	if (target.serverId && !target.server?.sshKeyId) {
		throw new ScalingServerUnavailableError(
			"The server has no SSH key configured.",
		);
	}
	return getRemoteDocker(target.serverId);
};

const hasHealthCheck = (healthCheck: HealthCheckSwarm | null) => {
	const test = healthCheck?.Test;
	return !!test && test.length > 0 && test[0] !== "NONE";
};

export const liveServiceMode = (
	spec: ServiceInspectInfo["Spec"],
): ServiceMode => {
	const mode = spec?.Mode;
	if (mode?.Global) return "global";
	if (mode?.ReplicatedJob) return "replicated-job";
	if (mode?.GlobalJob) return "global-job";
	return "replicated";
};

export const emptySummary = (): ReplicaSummary => ({
	replicas: [],
	recentFailures: [],
	counts: { ready: 0, starting: 0, pending: 0, stopping: 0, failedRecent: 0 },
	pendingReasons: [],
	distribution: [],
});

export const getApplicationScalingStatus = async (
	application: ScalableApplication,
	{ now = Date.now() }: { now?: number } = {},
): Promise<ScalingStatus> => {
	const configured = getConfiguredReplicas(application);
	const dokployHealthCheck = hasHealthCheck(application.healthCheckSwarm);
	const docker = await getScalingDocker(application);

	let inspect: ServiceInspectInfo;
	try {
		inspect = await docker.getService(application.appName).inspect();
	} catch (error) {
		if (!isDockerNotFoundError(error)) throw error;
		return {
			...emptySummary(),
			deployed: false,
			mode: getServiceMode(application.modeSwarm),
			configured,
			desired: null,
			stopped: false,
			inSync: true,
			rolloutInProgress: false,
			updateStatus: null,
			dokployHealthCheck,
		};
	}

	const [tasks, nodes] = await Promise.all([
		docker.listTasks({
			filters: JSON.stringify({ service: [inspect.ID] }),
		}) as Promise<SwarmTask[]>,
		// Only managers can list nodes; hostnames are optional detail.
		(docker.listNodes() as Promise<SwarmNode[]>).catch(() => []),
	]);

	const replicated = inspect.Spec?.Mode?.Replicated;
	const desired: number | null = replicated ? (replicated.Replicas ?? 1) : null;
	const update = inspect.UpdateStatus;
	const updateState: string | null = update?.State ?? null;
	const summary = summarizeReplicas({ tasks, nodes, now });

	return {
		...summary,
		recentFailures: await diagnoseFailures(docker, summary.recentFailures),
		deployed: true,
		mode: liveServiceMode(inspect.Spec),
		configured,
		desired,
		stopped: desired === 0,
		inSync: desired === null || desired === 0 || desired === configured,
		rolloutInProgress:
			!!updateState && ROLLOUT_IN_PROGRESS_STATES.has(updateState),
		updateStatus: update
			? {
					state: updateState,
					message: update.Message ?? null,
					startedAt: update.StartedAt ?? null,
					completedAt: update.CompletedAt ?? null,
				}
			: null,
		dokployHealthCheck,
	};
};

const statusCache = createTtlCache<ScalingStatus>(3_000);

export const getCachedApplicationScalingStatus = (
	application: ScalableApplication,
) =>
	statusCache.get(application.applicationId, () =>
		getApplicationScalingStatus(application),
	);

export const invalidateScalingStatus = (applicationId: string) => {
	statusCache.delete(applicationId);
};

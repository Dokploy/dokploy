import { z } from "zod";
import { docker } from "../../constants";
import { getWebServerSettings } from "../web-server-settings";
import type { CapacityApplication } from "./capacity-service";
import {
	getCachedComposeScalingStatus,
	type ScalableCompose,
	stackServiceName,
} from "./compose-status";
import {
	type ResourceBasis,
	resourceBasis,
	summarizeReplicaMetrics,
	type TaskSample,
	toReplicaSeries,
} from "./metrics-summary";
import { ScaleRejectedError } from "./scale-service";
import { getCachedApplicationScalingStatus, getScalingDocker } from "./status";

type MetricsConfig = NonNullable<
	Awaited<ReturnType<typeof getWebServerSettings>>
>["metricsConfig"];

interface MetricsServer {
	sshKeyId: string | null;
	ipAddress: string;
	metricsConfig: MetricsConfig;
}

/** Whatever runs on a server: the agent to ask is that server's. */
interface MetricsHost {
	serverId: string | null;
	server?: MetricsServer | null;
}

export interface MetricsApplication
	extends Omit<CapacityApplication, "server"> {
	server?: MetricsServer | null;
}

export interface MetricsCompose extends Omit<ScalableCompose, "server"> {
	server?: MetricsServer | null;
}

export type MetricsAgentStatus =
	| "ok"
	| "not_configured"
	| "collection_disabled"
	| "unreachable"
	| "outdated";

export interface MetricsAgentEndpoint {
	baseUrl: string;
	token: string;
	refreshRateSeconds: number;
}

export class MetricsAgentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MetricsAgentError";
	}
}

const DEFAULT_TASK_REFRESH_SECONDS = 15;
const FETCH_TIMEOUT_MS = 8_000;
const FEATURES_HEADER = "x-dokploy-agent-features";

const formatHost = (host: string) => (host.includes(":") ? `[${host}]` : host);

let localAgentHost: Promise<string> | null = null;

// The agent publishes its port on the node's own address. Dokploy runs in a
// container, so localhost would be the container itself.
const resolveLocalAgentHost = () => {
	localAgentHost ??= docker
		.info()
		.then((info) => info?.Swarm?.NodeAddr || "127.0.0.1")
		.catch((error) => {
			localAgentHost = null;
			throw error;
		});
	return localAgentHost;
};

export const resolveMetricsAgent = async (
	host: MetricsHost,
): Promise<{
	status: MetricsAgentStatus;
	endpoint: MetricsAgentEndpoint | null;
}> => {
	const config = host.serverId
		? host.server?.metricsConfig
		: (await getWebServerSettings())?.metricsConfig;
	const port = config?.server?.port;
	if (!config?.server?.token || !port) {
		return { status: "not_configured", endpoint: null };
	}
	if (!config.tasks?.enabled) {
		return { status: "collection_disabled", endpoint: null };
	}

	const address = host.serverId
		? host.server?.ipAddress
		: await resolveLocalAgentHost();
	if (!address) return { status: "not_configured", endpoint: null };
	const baseUrl =
		(!host.serverId && process.env.DOKPLOY_MONITORING_URL) ||
		`http://${formatHost(address)}:${port}`;

	return {
		status: "ok",
		endpoint: {
			baseUrl,
			token: config.server.token,
			refreshRateSeconds:
				config.tasks.refreshRate || DEFAULT_TASK_REFRESH_SECONDS,
		},
	};
};

const sampleSchema = z.object({
	timestamp: z.string(),
	service: z.string(),
	taskId: z.string(),
	slot: z.number(),
	nodeId: z.string(),
	containerId: z.string(),
	cpuCores: z.number(),
	memoryBytes: z.number(),
	memoryLimitBytes: z.number(),
});

const clusterSchema = z.object({
	samples: z.array(sampleSchema),
	nodes: z.array(
		z.object({
			nodeId: z.string(),
			hostname: z.string(),
			reachable: z.boolean(),
			samples: z.number(),
			error: z.string().optional(),
		}),
	),
	partial: z.boolean(),
});

export type ClusterSamples = z.infer<typeof clusterSchema>;

interface SampleQuery {
	service: string;
	since: Date;
	limit: number;
}

const getFromAgent = async (
	endpoint: MetricsAgentEndpoint,
	path: string,
	{ service, since, limit }: SampleQuery,
) => {
	const url = new URL(path, endpoint.baseUrl);
	url.searchParams.set("service", service);
	url.searchParams.set("since", since.toISOString());
	url.searchParams.set("limit", String(limit));

	let response: Response;
	try {
		response = await fetch(url, {
			headers: { Authorization: `Bearer ${endpoint.token}` },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
	} catch (error) {
		throw new MetricsAgentError(
			`Cannot reach the metrics agent at ${endpoint.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (!response.ok) {
		const body = (await response.text().catch(() => "")).slice(0, 200);
		throw new MetricsAgentError(
			`The metrics agent returned ${response.status}${body ? `: ${body}` : ""}`,
		);
	}
	return {
		body: await response.json().catch(() => null),
		features: (response.headers.get(FEATURES_HEADER) ?? "")
			.split(",")
			.map((feature) => feature.trim())
			.filter(Boolean),
	};
};

const unexpectedResponse = () =>
	new MetricsAgentError(
		"The metrics agent returned an unexpected response. Is it up to date?",
	);

export const fetchClusterSamples = async (
	endpoint: MetricsAgentEndpoint,
	query: SampleQuery,
): Promise<ClusterSamples> => {
	const { body } = await getFromAgent(
		endpoint,
		"/metrics/tasks/cluster",
		query,
	);
	const parsed = clusterSchema.safeParse(body);
	if (!parsed.success) throw unexpectedResponse();
	return parsed.data;
};

/** Samples the agent on one node holds itself, with what that agent collects. */
export const fetchNodeSamples = async (
	endpoint: MetricsAgentEndpoint,
	query: SampleQuery,
) => {
	const { body, features } = await getFromAgent(
		endpoint,
		"/metrics/tasks",
		query,
	);
	const parsed = z.array(sampleSchema).safeParse(body);
	if (!parsed.success) throw unexpectedResponse();
	return { samples: parsed.data, features };
};

/** Where an agent stores the replicas of a plain Docker Compose service. */
export const composeServiceKey = (project: string, service: string) =>
	`compose:${project}/${service}`;

interface ReplicaMetricsSource {
	endpoint: MetricsAgentEndpoint;
	service: string;
	/**
	 * Swarm replicas can run on any node, so the manager's agent asks every
	 * node. Docker Compose replicas run where Compose ran, which is the node
	 * whose agent Dokploy reaches for that server.
	 */
	scope: "cluster" | "node";
	readyReplicas: { taskId: string; slot: number | null }[];
	replicaCount: number;
	basis: () => Promise<ResourceBasis>;
}

export interface ReplicaMetricsResult {
	agent: { status: MetricsAgentStatus; message: string | null };
	data: {
		refreshRateSeconds: number;
		series: ReturnType<typeof toReplicaSeries>;
		summary: ReturnType<typeof summarizeReplicaMetrics>;
		nodes: ClusterSamples["nodes"];
		partial: boolean;
	} | null;
}

const readReplicaMetrics = async (
	source: ReplicaMetricsSource,
	{ rangeMinutes, now }: { rangeMinutes: number; now: number },
): Promise<ReplicaMetricsResult> => {
	const { endpoint } = source;
	const refreshRateSeconds = endpoint.refreshRateSeconds;
	// Enough rows for every replica over the whole range, plus slack for
	// replicas that were replaced during it.
	const query = {
		service: source.service,
		since: new Date(now - rangeMinutes * 60_000),
		limit: Math.min(
			20_000,
			Math.ceil((rangeMinutes * 60) / refreshRateSeconds) *
				(source.replicaCount + 2),
		),
	};

	let cluster: ClusterSamples;
	try {
		if (source.scope === "cluster") {
			cluster = await fetchClusterSamples(endpoint, query);
		} else {
			const node = await fetchNodeSamples(endpoint, query);
			if (!node.features.includes("compose")) {
				return {
					agent: {
						status: "outdated",
						message:
							"The metrics agent on this server is older than this version of Dokploy and does not read plain Docker Compose containers.",
					},
					data: null,
				};
			}
			cluster = { samples: node.samples, nodes: [], partial: false };
		}
	} catch (error) {
		if (error instanceof MetricsAgentError) {
			return {
				agent: { status: "unreachable", message: error.message },
				data: null,
			};
		}
		throw error;
	}

	const samples: TaskSample[] = cluster.samples;
	const summary = summarizeReplicaMetrics({
		samples,
		readyReplicas: source.readyReplicas,
		basis: await source.basis(),
		now,
		staleAfterMs: 3 * refreshRateSeconds * 1000,
	});

	return {
		agent: { status: "ok", message: null },
		data: {
			refreshRateSeconds,
			series: toReplicaSeries(samples),
			summary,
			nodes: cluster.nodes,
			partial:
				cluster.partial || summary.coverage.fresh < summary.coverage.ready,
		},
	};
};

const notReady = (status: MetricsAgentStatus): ReplicaMetricsResult => ({
	agent: { status, message: null },
	data: null,
});

const readyReplicasOf = (status: {
	replicas: { taskId: string; slot: number | null; phase: string }[];
}) =>
	status.replicas
		.filter((replica) => replica.phase === "ready")
		.map((replica) => ({ taskId: replica.taskId, slot: replica.slot }));

export const getApplicationMetrics = async (
	application: MetricsApplication,
	{ rangeMinutes, now = Date.now() }: { rangeMinutes: number; now?: number },
): Promise<ReplicaMetricsResult> => {
	const agent = await resolveMetricsAgent(application);
	if (!agent.endpoint) return notReady(agent.status);

	const status = await getCachedApplicationScalingStatus(
		application as Parameters<typeof getCachedApplicationScalingStatus>[0],
	);
	return readReplicaMetrics(
		{
			endpoint: agent.endpoint,
			service: application.appName,
			scope: "cluster",
			readyReplicas: readyReplicasOf(status),
			replicaCount: status.replicas.length,
			basis: async () => resourceBasis(application),
		},
		{ rangeMinutes, now },
	);
};

const amountOf = (value: number | null | undefined) =>
	value && value > 0 ? String(Math.round(value)) : null;

/** Utilization basis of a Stack service, from the spec Swarm runs. */
const stackServiceBasis = async (
	compose: MetricsCompose,
	swarmServiceName: string,
) => {
	const docker = await getScalingDocker(compose);
	const inspect = await docker
		.getService(swarmServiceName)
		.inspect()
		.catch(() => null);
	const resources = inspect?.Spec?.TaskTemplate?.Resources;
	return resourceBasis({
		cpuReservation: amountOf(resources?.Reservations?.NanoCPUs),
		cpuLimit: amountOf(resources?.Limits?.NanoCPUs),
		memoryReservation: amountOf(resources?.Reservations?.MemoryBytes),
		memoryLimit: amountOf(resources?.Limits?.MemoryBytes),
	});
};

/**
 * Utilization basis of a plain Docker Compose service, from what Docker
 * enforces on one of its containers: Compose turns `cpus`, `mem_limit` and
 * `deploy.resources` into these. Docker has no CPU reservation.
 */
const composeContainerBasis = async (
	compose: MetricsCompose,
	containerId: string | undefined,
) => {
	const none = resourceBasis({
		cpuReservation: null,
		cpuLimit: null,
		memoryReservation: null,
		memoryLimit: null,
	});
	if (!containerId) return none;
	const docker = await getScalingDocker(compose);
	const inspect = await docker
		.getContainer(containerId)
		.inspect()
		.catch(() => null);
	const host = inspect?.HostConfig;
	if (!host) return none;
	const quotaCpus =
		host.CpuQuota && host.CpuPeriod
			? (host.CpuQuota / host.CpuPeriod) * 1_000_000_000
			: 0;
	return resourceBasis({
		cpuReservation: null,
		cpuLimit: amountOf(host.NanoCpus || quotaCpus),
		memoryReservation: amountOf(host.MemoryReservation),
		memoryLimit: amountOf(host.Memory),
	});
};

export const getComposeServiceMetrics = async (
	compose: MetricsCompose,
	serviceName: string,
	{ rangeMinutes, now = Date.now() }: { rangeMinutes: number; now?: number },
): Promise<ReplicaMetricsResult> => {
	const status = await getCachedComposeScalingStatus(
		compose as Parameters<typeof getCachedComposeScalingStatus>[0],
	);
	const service = status.services.find(
		(candidate) => candidate.serviceName === serviceName,
	);
	if (!service) {
		throw new ScaleRejectedError(
			"unknown_service",
			`Service "${serviceName}" is not part of this compose.`,
		);
	}

	const agent = await resolveMetricsAgent(compose);
	if (!agent.endpoint) return notReady(agent.status);

	const readyReplicas = readyReplicasOf(service);
	const stack = compose.composeType === "stack";
	const swarmServiceName = stackServiceName(compose.appName, serviceName);
	return readReplicaMetrics(
		{
			endpoint: agent.endpoint,
			service: stack
				? swarmServiceName
				: composeServiceKey(compose.appName, serviceName),
			scope: stack ? "cluster" : "node",
			readyReplicas,
			replicaCount: service.replicas.length,
			basis: () =>
				stack
					? stackServiceBasis(compose, swarmServiceName)
					: composeContainerBasis(compose, readyReplicas[0]?.taskId),
		},
		{ rangeMinutes, now },
	);
};

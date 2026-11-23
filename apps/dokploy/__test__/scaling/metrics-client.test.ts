import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getWebServerSettings: vi.fn(),
	info: vi.fn(),
	status: vi.fn(),
	composeStatus: vi.fn(),
	getScalingDocker: vi.fn(),
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
}));

vi.mock("@dokploy/server/constants", () => ({
	docker: { info: mocks.info },
}));

vi.mock("@dokploy/server/services/scaling/status", () => ({
	getCachedApplicationScalingStatus: mocks.status,
	getScalingDocker: mocks.getScalingDocker,
}));

vi.mock("@dokploy/server/services/scaling/compose-status", () => ({
	getCachedComposeScalingStatus: mocks.composeStatus,
	stackServiceName: (appName: string, service: string) =>
		`${appName}_${service}`,
}));

const {
	fetchClusterSamples,
	getApplicationMetrics,
	getComposeServiceMetrics,
	MetricsAgentError,
	resolveMetricsAgent,
} = await import("@dokploy/server/services/scaling/metrics-client");

type MetricsApplication = Parameters<typeof getApplicationMetrics>[0];
type MetricsCompose = Parameters<typeof getComposeServiceMetrics>[0];

const config = (overrides: Record<string, unknown> = {}) => ({
	server: {
		type: "Remote",
		refreshRate: 60,
		port: 4500,
		token: "secret",
		urlCallback: "http://dokploy/cb",
		retentionDays: 2,
		cronJob: "0 0 * * *",
		thresholds: { cpu: 0, memory: 0 },
	},
	containers: { refreshRate: 60, services: { include: [], exclude: [] } },
	tasks: { enabled: true, refreshRate: 15, retentionHours: 24 },
	...overrides,
});

const application = (
	overrides: Partial<MetricsApplication> = {},
): MetricsApplication => ({
	applicationId: "app-1",
	appName: "web",
	serverId: "srv-1",
	replicas: 2,
	modeSwarm: null,
	healthCheckSwarm: null,
	server: {
		sshKeyId: "key",
		ipAddress: "203.0.113.10",
		metricsConfig: config() as never,
	},
	sourceType: "docker",
	registryId: null,
	buildRegistryId: null,
	cpuLimit: null,
	cpuReservation: "1000000000",
	memoryLimit: null,
	memoryReservation: null,
	placementSwarm: null,
	endpointSpecSwarm: null,
	mounts: [],
	ports: [],
	...overrides,
});

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

const fetchMock = vi.fn();

describe("resolveMetricsAgent", () => {
	beforeEach(() => {
		mocks.getWebServerSettings.mockReset();
		mocks.info.mockReset();
		delete process.env.DOKPLOY_MONITORING_URL;
	});

	it("uses the remote server's address and token", async () => {
		await expect(resolveMetricsAgent(application())).resolves.toEqual({
			status: "ok",
			endpoint: {
				baseUrl: "http://203.0.113.10:4500",
				token: "secret",
				refreshRateSeconds: 15,
			},
		});
	});

	it("reaches the local agent on the node address, not the container's localhost", async () => {
		mocks.getWebServerSettings.mockResolvedValue({ metricsConfig: config() });
		mocks.info.mockResolvedValue({ Swarm: { NodeAddr: "10.0.0.5" } });

		const { endpoint } = await resolveMetricsAgent(
			application({ serverId: null, server: null }),
		);
		expect(endpoint?.baseUrl).toBe("http://10.0.0.5:4500");
	});

	it("lets the local address be overridden", async () => {
		process.env.DOKPLOY_MONITORING_URL = "http://127.0.0.1:24500";
		mocks.getWebServerSettings.mockResolvedValue({ metricsConfig: config() });
		mocks.info.mockResolvedValue({ Swarm: { NodeAddr: "10.0.0.5" } });

		const { endpoint } = await resolveMetricsAgent(
			application({ serverId: null, server: null }),
		);
		expect(endpoint?.baseUrl).toBe("http://127.0.0.1:24500");
	});

	it("brackets IPv6 addresses", async () => {
		const { endpoint } = await resolveMetricsAgent(
			application({
				server: {
					sshKeyId: "key",
					ipAddress: "2001:db8::1",
					metricsConfig: config() as never,
				},
			}),
		);
		expect(endpoint?.baseUrl).toBe("http://[2001:db8::1]:4500");
	});

	it("reports an agent without a token, or with collection off", async () => {
		const withoutToken = config();
		withoutToken.server.token = "";
		await expect(
			resolveMetricsAgent(
				application({
					server: {
						sshKeyId: "k",
						ipAddress: "1.2.3.4",
						metricsConfig: withoutToken as never,
					},
				}),
			),
		).resolves.toEqual({ status: "not_configured", endpoint: null });

		await expect(
			resolveMetricsAgent(
				application({
					server: {
						sshKeyId: "k",
						ipAddress: "1.2.3.4",
						metricsConfig: config({ tasks: undefined }) as never,
					},
				}),
			),
		).resolves.toEqual({ status: "collection_disabled", endpoint: null });
	});
});

describe("fetchClusterSamples", () => {
	const endpoint = {
		baseUrl: "http://203.0.113.10:4500",
		token: "secret",
		refreshRateSeconds: 15,
	};

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => vi.unstubAllGlobals());

	it("asks the manager's agent for the whole cluster with the token", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ samples: [], nodes: [], partial: false }),
		);

		await fetchClusterSamples(endpoint, {
			service: "web",
			since: new Date("2026-10-28T11:00:00Z"),
			limit: 500,
		});

		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(String(url)).toBe(
			"http://203.0.113.10:4500/metrics/tasks/cluster?service=web&since=2026-10-28T11%3A00%3A00.000Z&limit=500",
		);
		expect(init.headers).toEqual({ Authorization: "Bearer secret" });
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it.each([
		[
			"a network failure",
			() => fetchMock.mockRejectedValue(new Error("ECONNREFUSED")),
			/Cannot reach/,
		],
		[
			"an error status",
			() => fetchMock.mockResolvedValue(new Response("nope", { status: 401 })),
			/returned 401: nope/,
		],
		[
			"an unexpected body",
			() => fetchMock.mockResolvedValue(jsonResponse({ samples: "x" })),
			/unexpected response/,
		],
	])("turns %s into a MetricsAgentError", async (_, arrange, message) => {
		arrange();
		const error = await fetchClusterSamples(endpoint, {
			service: "web",
			since: new Date(),
			limit: 10,
		}).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(MetricsAgentError);
		expect((error as Error).message).toMatch(message);
	});
});

describe("getApplicationMetrics", () => {
	const now = Date.parse("2026-10-28T12:00:00Z");

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
		mocks.status.mockResolvedValue({
			replicas: [
				{ taskId: "t1", slot: 1, phase: "ready" },
				{ taskId: "t2", slot: 2, phase: "ready" },
				{ taskId: "t3", slot: 3, phase: "starting" },
			],
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	it("returns no data and the reason when the agent is not set up", async () => {
		const result = await getApplicationMetrics(
			application({
				server: {
					sshKeyId: "k",
					ipAddress: "1.2.3.4",
					metricsConfig: config({ tasks: { enabled: false } }) as never,
				},
			}),
			{ rangeMinutes: 60, now },
		);
		expect(result).toEqual({
			agent: { status: "collection_disabled", message: null },
			data: null,
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reports an unreachable agent instead of failing the request", async () => {
		fetchMock.mockRejectedValue(new Error("timeout"));
		const result = await getApplicationMetrics(application(), {
			rangeMinutes: 60,
			now,
		});
		expect(result.agent.status).toBe("unreachable");
		expect(result.agent.message).toMatch(/Cannot reach the metrics agent/);
	});

	it("marks the data partial when a ready replica has no fresh reading", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({
				samples: [
					{
						timestamp: new Date(now - 5_000).toISOString(),
						service: "web",
						taskId: "t1",
						slot: 1,
						nodeId: "n1",
						containerId: "c1",
						cpuCores: 0.5,
						memoryBytes: 100,
						memoryLimitBytes: 0,
					},
				],
				nodes: [{ nodeId: "n1", hostname: "a", reachable: true, samples: 1 }],
				partial: false,
			}),
		);

		const result = await getApplicationMetrics(application(), {
			rangeMinutes: 60,
			now,
		});

		expect(result.agent.status).toBe("ok");
		expect(result.data?.summary.coverage).toEqual({ ready: 2, fresh: 1 });
		expect(result.data?.summary.averages.cpuPercent).toBeCloseTo(50);
		expect(result.data?.partial).toBe(true);
		const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(url.searchParams.get("limit")).toBe(String(240 * 5));
	});
});

describe("getComposeServiceMetrics", () => {
	const now = Date.parse("2026-10-28T12:00:00Z");
	const containerInspect = vi.fn();
	const serviceInspect = vi.fn();

	const compose = (composeType: "stack" | "docker-compose") =>
		({
			composeId: "c1",
			appName: "shop",
			composeType,
			serverId: "srv-1",
			server: {
				sshKeyId: "key",
				ipAddress: "203.0.113.10",
				metricsConfig: config() as never,
			},
		}) as unknown as MetricsCompose;

	const sample = (taskId: string, slot: number, service: string) => ({
		timestamp: new Date(now - 5_000).toISOString(),
		service,
		taskId,
		slot,
		nodeId: "",
		containerId: taskId,
		cpuCores: 0.25,
		memoryBytes: 64 * 1024 ** 2,
		memoryLimitBytes: 0,
	});

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
		mocks.composeStatus.mockResolvedValue({
			services: [
				{
					serviceName: "web",
					replicas: [
						{ taskId: "container-1", slot: 1, phase: "ready" },
						{ taskId: "container-2", slot: 2, phase: "ready" },
					],
				},
			],
		});
		containerInspect.mockReset();
		serviceInspect.mockReset();
		mocks.getScalingDocker.mockResolvedValue({
			getContainer: () => ({ inspect: containerInspect }),
			getService: () => ({ inspect: serviceInspect }),
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	it("reads plain Compose replicas from the agent on the compose's server", async () => {
		fetchMock.mockResolvedValue(
			new Response(
				JSON.stringify([
					sample("container-1", 1, "compose:shop/web"),
					sample("container-2", 2, "compose:shop/web"),
				]),
				{ headers: { "X-Dokploy-Agent-Features": "compose" } },
			),
		);
		containerInspect.mockResolvedValue({
			HostConfig: {
				NanoCpus: 500_000_000,
				Memory: 256 * 1024 ** 2,
				MemoryReservation: 0,
			},
		});

		const result = await getComposeServiceMetrics(
			compose("docker-compose"),
			"web",
			{
				rangeMinutes: 60,
				now,
			},
		);

		const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(url.origin).toBe("http://203.0.113.10:4500");
		expect(url.pathname).toBe("/metrics/tasks");
		expect(url.searchParams.get("service")).toBe("compose:shop/web");
		expect(result.agent.status).toBe("ok");
		expect(result.data?.summary.coverage).toEqual({ ready: 2, fresh: 2 });
		expect(result.data?.summary.basis).toMatchObject({
			cpuCores: 0.5,
			cpuSource: "limit",
			memoryBytes: 256 * 1024 ** 2,
			memorySource: "limit",
		});
		expect(result.data?.summary.averages.cpuPercent).toBeCloseTo(50);
		expect(result.data?.nodes).toEqual([]);
	});

	it("asks for an agent update when the agent predates Compose sampling", async () => {
		fetchMock.mockResolvedValue(jsonResponse([]));

		const result = await getComposeServiceMetrics(
			compose("docker-compose"),
			"web",
			{
				rangeMinutes: 60,
				now,
			},
		);

		expect(result.agent.status).toBe("outdated");
		expect(result.data).toBeNull();
	});

	it("reads Stack replicas across the swarm, measured against the service spec", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({
				samples: [sample("container-1", 1, "shop_web")],
				nodes: [{ nodeId: "n1", hostname: "a", reachable: true, samples: 1 }],
				partial: false,
			}),
		);
		serviceInspect.mockResolvedValue({
			Spec: {
				TaskTemplate: {
					Resources: {
						Reservations: { NanoCPUs: 250_000_000, MemoryBytes: 0 },
						Limits: { MemoryBytes: 512 * 1024 ** 2 },
					},
				},
			},
		});

		const result = await getComposeServiceMetrics(compose("stack"), "web", {
			rangeMinutes: 60,
			now,
		});

		const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(url.pathname).toBe("/metrics/tasks/cluster");
		expect(url.searchParams.get("service")).toBe("shop_web");
		expect(result.data?.summary.basis).toMatchObject({
			cpuCores: 0.25,
			cpuSource: "reservation",
			memorySource: "limit",
		});
		expect(result.data?.partial).toBe(true);
	});

	it("refuses a service the compose does not have", async () => {
		await expect(
			getComposeServiceMetrics(compose("stack"), "worker", {
				rangeMinutes: 60,
				now,
			}),
		).rejects.toMatchObject({ reason: "unknown_service" });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

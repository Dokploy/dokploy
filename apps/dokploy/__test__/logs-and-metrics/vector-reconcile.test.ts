import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

const mocks = vi.hoisted(() => ({
	findServerById: vi.fn(),
	getWebServerSettings: vi.fn(),
	findEnabledTelemetryProvidersByOrganization: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	inspectService: vi.fn(),
	updateService: vi.fn(),
	removeService: vi.fn(),
	createService: vi.fn(),
	getService: vi.fn(),
	listContainers: vi.fn(),
	killContainer: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({ db: {} }));
vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
	paths: (isServer: boolean) => ({
		VECTOR_PATH: isServer ? "/etc/dokploy/vector" : "/local/dokploy/vector",
	}),
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
	findServersByOrganizationForVectorAgent: vi.fn(),
	getAccessibleServerIds: vi.fn(),
}));
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
}));
vi.mock(
	"@dokploy/server/services/logs-and-metrics/service",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("@dokploy/server/services/logs-and-metrics/service")
		>()),
		findEnabledTelemetryProvidersByOrganization:
			mocks.findEnabledTelemetryProvidersByOrganization,
	}),
);
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));
vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: async () => ({
		getService: mocks.getService,
		createService: mocks.createService,
		listContainers: mocks.listContainers,
		getContainer: () => ({ kill: mocks.killContainer }),
	}),
}));

const { reconcileVectorAgent, removeVectorAgent } = await import(
	"@dokploy/server/setup/vector-setup"
);

const lokiProvider = {
	telemetryProviderId: "lp-1",
	name: "loki",
	providerType: "loki",
	signals: ["logs"],
	endpoint: "https://loki.example.com",
	apiKey: "sekret-token",
	apiSecret: null,
	extraConfig: null,
	enabled: true,
	organizationId: "org-a",
};

const promProvider = {
	...lokiProvider,
	telemetryProviderId: "mp-1",
	name: "prom",
	providerType: "prometheus_remote_write",
	signals: ["metrics"],
	endpoint: "http://prom.example.com:9090/api/v1/write",
	apiKey: null,
};

const notFound = () =>
	Object.assign(new Error("not found"), { statusCode: 404 });

const writtenYaml = (command: string) => {
	const match = command.match(/echo "([^"]+)" \| base64 -d/);
	return parse(Buffer.from(match?.[1] ?? "", "base64").toString("utf8"));
};

const commandsOf = (mock: typeof mocks.execAsync) =>
	mock.mock.calls.map((call) => String(call[call.length - 1]));

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.getService.mockImplementation(() => ({
		inspect: mocks.inspectService,
		update: mocks.updateService,
		remove: mocks.removeService,
	}));
	mocks.inspectService.mockRejectedValue(notFound());
	mocks.removeService.mockRejectedValue(notFound());
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.listContainers.mockResolvedValue([{ Id: "vector-container" }]);
	mocks.killContainer.mockResolvedValue(undefined);
});

describe("reconcileVectorAgent", () => {
	it("writes, validates and applies the YAML and deploys Vector for the saved selection", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-a",
			telemetryProviderIds: ["lp-1"],
		});
		mocks.findEnabledTelemetryProvidersByOrganization.mockResolvedValue([
			lokiProvider,
		]);

		await reconcileVectorAgent();

		const commands = commandsOf(mocks.execAsync);
		expect(commands).toHaveLength(3);
		expect(commands[0]).toContain(
			"/local/dokploy/vector/vector.yaml.candidate.",
		);
		expect(commands[1]).toMatch(
			/timberio\/vector:\d+\.\d+\.\d+-alpine validate --skip-healthchecks/,
		);
		expect(commands[2]).toMatch(
			/^mv \/local\/dokploy\/vector\/vector\.yaml\.candidate\.\S+ \/local\/dokploy\/vector\/vector\.yaml$/,
		);
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();

		const config = writtenYaml(commands[0] ?? "");
		expect(config.sinks["sink_lp-1"].inputs).toEqual([
			"dokploy_scope_local_only",
		]);
		expect(config.sources.host_metrics_source).toBeUndefined();

		expect(mocks.createService).toHaveBeenCalledTimes(1);
		expect(mocks.createService.mock.calls[0]?.[0]).toMatchObject({
			Name: "dokploy-vector",
		});
		expect(mocks.getService).toHaveBeenCalledWith("dokploy-cadvisor");
		expect(mocks.removeService).toHaveBeenCalledTimes(1);
	});

	it("splits one selection into the logs and metrics pipelines by what each provider sends", async () => {
		const datadogProvider = {
			...lokiProvider,
			telemetryProviderId: "dd-1",
			name: "datadog",
			providerType: "datadog",
			signals: ["logs", "metrics"],
			endpoint: null,
			apiKey: "dd-key",
		};
		const unselected = { ...lokiProvider, telemetryProviderId: "lp-9" };
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-a",
			telemetryProviderIds: ["lp-1", "mp-1", "dd-1"],
		});
		mocks.findEnabledTelemetryProvidersByOrganization.mockResolvedValue([
			lokiProvider,
			promProvider,
			datadogProvider,
			unselected,
		]);

		await reconcileVectorAgent();

		const config = writtenYaml(commandsOf(mocks.execAsync)[0] ?? "");
		const sinkIds = Object.keys(config.sinks);
		expect(sinkIds.some((id) => id.includes("lp-1"))).toBe(true);
		expect(sinkIds.some((id) => id.includes("mp-1"))).toBe(true);
		expect(sinkIds.filter((id) => id.includes("dd-1")).length).toBe(2);
		expect(sinkIds.some((id) => id.includes("lp-9"))).toBe(false);
		expect(config.sources.docker_logs_source).toBeDefined();
		expect(config.sources.cadvisor_source).toBeDefined();
		expect(mocks.createService.mock.calls.map((c) => c[0].Name)).toEqual([
			"dokploy-vector",
			"dokploy-cadvisor",
		]);
	});

	it("removes cAdvisor but keeps Vector when no selected provider sends metrics", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-a",
			telemetryProviderIds: ["lp-1", "mp-1"],
		});
		mocks.findEnabledTelemetryProvidersByOrganization.mockResolvedValue([
			lokiProvider,
		]);

		await reconcileVectorAgent();

		const config = writtenYaml(commandsOf(mocks.execAsync)[0] ?? "");
		expect(config.sources.cadvisor_source).toBeUndefined();
		expect(mocks.createService.mock.calls.map((c) => c[0].Name)).toEqual([
			"dokploy-vector",
		]);
		expect(mocks.getService).toHaveBeenCalledWith("dokploy-cadvisor");
		expect(mocks.removeService).toHaveBeenCalledTimes(1);
	});

	it("filters by the organization only on the local host and runs on the server over SSH", async () => {
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			organizationId: "org-a",
			name: "edge-1",
			telemetryProviderIds: ["lp-1"],
		});
		mocks.findEnabledTelemetryProvidersByOrganization.mockResolvedValue([
			lokiProvider,
		]);

		await reconcileVectorAgent("server-1");

		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(
			mocks.execAsyncRemote.mock.calls.every((c) => c[0] === "server-1"),
		).toBe(true);
		const config = writtenYaml(commandsOf(mocks.execAsyncRemote)[0] ?? "");
		expect(config.transforms.dokploy_scope_local_only).toBeUndefined();
		expect(config.sinks["sink_lp-1"].inputs).toEqual(["dokploy_scope"]);
	});

	it("does not apply a config that vector validate rejects, redacts secrets and leaves the selection alone", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-a",
			telemetryProviderIds: ["lp-1"],
		});
		mocks.findEnabledTelemetryProvidersByOrganization.mockResolvedValue([
			lokiProvider,
		]);
		mocks.execAsync.mockImplementation(async (command: string) => {
			if (command.includes("validate")) {
				throw new Error("bad sink: password sekret-token rejected");
			}
			return { stdout: "", stderr: "" };
		});

		await expect(reconcileVectorAgent()).rejects.toThrow(
			/failed validation, not applying it: bad sink: password \[redacted\] rejected/,
		);

		const commands = commandsOf(mocks.execAsync);
		expect(commands.some((c) => c.startsWith("mv "))).toBe(false);
		expect(commands.some((c) => c.startsWith("rm -f "))).toBe(true);
		expect(mocks.createService).not.toHaveBeenCalled();
	});

	it("removes the agent when no enabled provider is left in the selection", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-a",
			telemetryProviderIds: ["deleted-or-disabled"],
		});
		mocks.findEnabledTelemetryProvidersByOrganization.mockResolvedValue([]);

		await reconcileVectorAgent();

		expect(mocks.getService).toHaveBeenCalledWith("dokploy-cadvisor");
		expect(mocks.getService).toHaveBeenCalledWith("dokploy-vector");
		expect(mocks.removeService).toHaveBeenCalledTimes(2);
		expect(commandsOf(mocks.execAsync)).toEqual([
			"rm -rf /local/dokploy/vector",
		]);
		expect(mocks.createService).not.toHaveBeenCalled();
	});

	it("removes the agent when the selection is empty, without an owner", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: null,
			telemetryProviderIds: [],
		});

		await reconcileVectorAgent();

		expect(
			mocks.findEnabledTelemetryProvidersByOrganization,
		).not.toHaveBeenCalled();
		expect(mocks.removeService).toHaveBeenCalledTimes(2);
	});

	it("deploys cAdvisor next to Vector when metrics providers are assigned", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-a",
			telemetryProviderIds: ["mp-1"],
		});
		mocks.findEnabledTelemetryProvidersByOrganization.mockResolvedValue([
			promProvider,
		]);

		await reconcileVectorAgent();

		const config = writtenYaml(commandsOf(mocks.execAsync)[0] ?? "");
		expect(config.sources.docker_logs_source).toBeUndefined();
		expect(config.sources.cadvisor_source.endpoints).toEqual([
			"http://127.0.0.1:4510/metrics",
		]);

		expect(mocks.createService.mock.calls.map((c) => c[0].Name)).toEqual([
			"dokploy-vector",
			"dokploy-cadvisor",
		]);
		const cadvisor = mocks.createService.mock.calls[1]?.[0];
		expect(cadvisor.TaskTemplate.ContainerSpec.Image).toMatch(
			/^ghcr\.io\/google\/cadvisor:v\d+\.\d+\.\d+$/,
		);
		expect(cadvisor.TaskTemplate.ContainerSpec.Args).toEqual(
			expect.arrayContaining([
				"--listen_ip=127.0.0.1",
				"--port=4510",
				"--docker_only=true",
				"--store_container_labels=false",
			]),
		);
		expect(cadvisor.TaskTemplate.ContainerSpec.HealthCheck).toEqual({
			Test: ["NONE"],
		});
		expect(cadvisor.TaskTemplate.Networks).toEqual([{ Target: "host" }]);
		expect(mocks.removeService).not.toHaveBeenCalled();
	});

	it("removes the agent on a remote server when the selection is empty", async () => {
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			sshKeyId: "key-1",
			organizationId: "org-a",
			name: "edge-1",
			telemetryProviderIds: [],
		});
		mocks.findEnabledTelemetryProvidersByOrganization.mockResolvedValue([]);

		await reconcileVectorAgent("server-1");

		expect(
			mocks.findEnabledTelemetryProvidersByOrganization,
		).toHaveBeenCalled();
		expect(mocks.removeService).toHaveBeenCalledTimes(2);
		expect(mocks.createService).not.toHaveBeenCalled();
		expect(commandsOf(mocks.execAsyncRemote)).toEqual([
			"rm -rf /etc/dokploy/vector",
		]);
	});

	it("redacts the config and secrets when writing or applying the candidate fails", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-a",
			telemetryProviderIds: ["lp-1"],
		});
		mocks.findEnabledTelemetryProvidersByOrganization.mockResolvedValue([
			lokiProvider,
		]);
		const echoCommand = async (command: string) => {
			if (command.includes("base64 -d") || command.startsWith("mv ")) {
				throw new Error(`Command failed: ${command} (token sekret-token)`);
			}
			return { stdout: "", stderr: "" };
		};
		mocks.execAsync.mockImplementation(echoCommand);

		const writeError = await reconcileVectorAgent().catch(
			(e: Error) => e.message,
		);
		expect(writeError).toMatch(/^Failed to write the Vector config: /);
		expect(writeError).not.toContain("sekret-token");
		expect(writeError).not.toContain(
			Buffer.from("data_dir").toString("base64").slice(0, 8),
		);
		expect(writeError).toContain("[redacted]");

		mocks.execAsync.mockImplementation(async (command: string) => {
			if (command.startsWith("mv ")) return echoCommand(command);
			return { stdout: "", stderr: "" };
		});
		const applyError = await reconcileVectorAgent().catch(
			(e: Error) => e.message,
		);
		expect(applyError).toMatch(/^Failed to apply the Vector config: /);
		expect(applyError).not.toContain("sekret-token");
		expect(mocks.createService).not.toHaveBeenCalled();
	});

	it("propagates a rejected service update instead of pretending the create succeeded", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-a",
			telemetryProviderIds: ["lp-1"],
		});
		mocks.findEnabledTelemetryProvidersByOrganization.mockResolvedValue([
			lokiProvider,
		]);
		mocks.inspectService.mockResolvedValue({
			Version: { Index: "7" },
			Spec: { TaskTemplate: { ForceUpdate: 2 } },
		});
		mocks.updateService.mockRejectedValue(
			new Error("rpc error: invalid mount"),
		);

		await expect(reconcileVectorAgent()).rejects.toThrow("invalid mount");
		expect(mocks.createService).not.toHaveBeenCalled();
	});

	it("propagates an inspect failure that is not a 404", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-a",
			telemetryProviderIds: ["lp-1"],
		});
		mocks.findEnabledTelemetryProvidersByOrganization.mockResolvedValue([
			lokiProvider,
		]);
		mocks.inspectService.mockRejectedValue(
			Object.assign(new Error("daemon unreachable"), { statusCode: 500 }),
		);

		await expect(reconcileVectorAgent()).rejects.toThrow("daemon unreachable");
		expect(mocks.createService).not.toHaveBeenCalled();
	});

	it("does not restart Vector on a config-only redeploy", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-a",
			telemetryProviderIds: ["lp-1"],
		});
		mocks.findEnabledTelemetryProvidersByOrganization.mockResolvedValue([
			lokiProvider,
		]);
		mocks.inspectService.mockImplementation(async () => ({
			Version: { Index: "7" },
			Spec: {
				TaskTemplate: {
					ForceUpdate: 2,
					ContainerSpec: mocks.createService.mock.calls[0]?.[0]
						? undefined
						: undefined,
				},
			},
		}));

		await reconcileVectorAgent();
		expect(mocks.killContainer).toHaveBeenCalledWith({ signal: "SIGHUP" });
		expect(mocks.listContainers).toHaveBeenCalledWith({
			filters: JSON.stringify({
				label: ["com.docker.swarm.service.name=dokploy-vector"],
			}),
		});
		const firstSpec = mocks.updateService.mock.calls[0]?.[0];
		mocks.inspectService.mockResolvedValue({
			Version: { Index: "8" },
			Spec: { TaskTemplate: { ...firstSpec.TaskTemplate, ForceUpdate: 3 } },
		});
		mocks.updateService.mockClear();

		await reconcileVectorAgent();
		expect(mocks.updateService).toHaveBeenCalledWith(
			expect.objectContaining({
				version: 8,
				TaskTemplate: expect.objectContaining({ ForceUpdate: 3 }),
			}),
		);
	});

	it("updates an existing Vector service instead of creating it", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-a",
			telemetryProviderIds: ["lp-1"],
		});
		mocks.findEnabledTelemetryProvidersByOrganization.mockResolvedValue([
			lokiProvider,
		]);
		mocks.inspectService.mockResolvedValue({
			Version: { Index: "7" },
			Spec: { TaskTemplate: { ForceUpdate: 2 } },
		});

		await reconcileVectorAgent();

		expect(mocks.createService).not.toHaveBeenCalled();
		expect(mocks.updateService).toHaveBeenCalledWith(
			expect.objectContaining({
				version: 7,
				TaskTemplate: expect.objectContaining({ ForceUpdate: 3 }),
			}),
		);
	});
});

describe("removeVectorAgent", () => {
	it("removes cAdvisor, then Vector, then the config directory", async () => {
		await removeVectorAgent();

		expect(mocks.getService.mock.calls.map((c) => c[0])).toEqual([
			"dokploy-cadvisor",
			"dokploy-vector",
		]);
		expect(commandsOf(mocks.execAsync)).toEqual([
			"rm -rf /local/dokploy/vector",
		]);
	});

	it("keeps going when cAdvisor cannot be removed", async () => {
		mocks.removeService
			.mockRejectedValueOnce(new Error("docker hiccup"))
			.mockRejectedValueOnce(notFound());

		await removeVectorAgent();

		expect(mocks.removeService).toHaveBeenCalledTimes(2);
		expect(commandsOf(mocks.execAsync)).toEqual([
			"rm -rf /local/dokploy/vector",
		]);
	});

	it("refuses a server without an SSH key before touching cAdvisor or Vector", async () => {
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			sshKeyId: null,
		});

		await expect(removeVectorAgent("server-1")).rejects.toThrow(/SSH key/);
		expect(mocks.getService).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});
});

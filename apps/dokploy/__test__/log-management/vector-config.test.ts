import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

const mocks = vi.hoisted(() => ({
	findManyProjects: vi.fn(),
	findEnabledLogProvidersByOrganization: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			projects: {
				findMany: mocks.findManyProjects,
			},
		},
	},
}));

vi.mock(
	"@dokploy/server/services/log-management/service",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("@dokploy/server/services/log-management/service")
		>()),
		findEnabledLogProvidersByOrganization:
			mocks.findEnabledLogProvidersByOrganization,
	}),
);

const { buildVectorConfigYaml } = await import(
	"@dokploy/server/setup/vector-setup"
);

describe("buildVectorConfigYaml", () => {
	it("generates a source, a dokploy_scope transform and one sink per enabled provider", async () => {
		mocks.findManyProjects.mockResolvedValue([
			{
				projectId: "project-1",
				name: "My Project",
				environments: [
					{
						environmentId: "env-1",
						name: "production",
						applications: [
							{
								appName: "app-my-app-abc123",
								applicationId: "application-1",
								name: "my-app",
							},
						],
						compose: [],
					},
				],
			},
		]);
		mocks.findEnabledLogProvidersByOrganization.mockResolvedValue([
			{
				logProviderId: "log-provider-1",
				name: "loki-prod",
				providerType: "loki",
				endpoint: "https://loki.example.com",
				apiKey: null,
				apiSecret: null,
				extraConfig: null,
			},
		]);

		const yamlStr = await buildVectorConfigYaml("org-1");
		const config = parse(yamlStr) as any;

		expect(config.data_dir).toBe("/var/lib/vector");
		expect(config.sources.docker_logs_source.type).toBe("docker_logs");
		expect(config.transforms.dokploy_scope.type).toBe("remap");
		expect(config.transforms.dokploy_scope.inputs).toEqual([
			"docker_logs_source",
		]);
		expect(config.transforms.dokploy_scope.source).toContain(
			'.dokploy_organization = "org-1"',
		);
		expect(config.transforms.dokploy_scope.source).toContain(
			'app_name == "app-my-app-abc123"',
		);
		expect(config.transforms.dokploy_scope.source).toContain(
			'.dokploy_project = "My Project"',
		);
		expect(config.transforms.dokploy_scope.source).toContain(
			'.dokploy_environment = "production"',
		);
		expect(config.transforms.dokploy_scope.source).toContain(
			'.dokploy_application = "my-app"',
		);

		const sinkIds = Object.keys(config.sinks);
		expect(sinkIds).toEqual(["sink_log-provider-1"]);
		expect(config.sinks["sink_log-provider-1"].type).toBe("loki");
		expect(config.sinks["sink_log-provider-1"].inputs).toEqual([
			"dokploy_scope",
		]);
	});

	it("chains scope -> transform -> sink for betterstack/datadog, and scope -> sink direct for loki", async () => {
		mocks.findManyProjects.mockResolvedValue([]);
		mocks.findEnabledLogProvidersByOrganization.mockResolvedValue([
			{
				logProviderId: "loki-1",
				name: "loki",
				providerType: "loki",
				endpoint: "https://loki.example.com",
				apiKey: null,
				apiSecret: null,
				extraConfig: null,
			},
			{
				logProviderId: "bs-1",
				name: "betterstack",
				providerType: "betterstack",
				endpoint: "https://in.logs.betterstack.com",
				apiKey: "token",
				apiSecret: null,
				extraConfig: null,
			},
			{
				logProviderId: "dd-1",
				name: "datadog",
				providerType: "datadog",
				endpoint: null,
				apiKey: "dd-key",
				apiSecret: null,
				extraConfig: null,
			},
		]);

		const yamlStr = await buildVectorConfigYaml("org-1");
		const config = parse(yamlStr) as any;

		expect(config.sinks["sink_loki-1"].inputs).toEqual(["dokploy_scope"]);
		expect(config.transforms["transform_bs-1"]).toBeDefined();
		expect(config.transforms["transform_bs-1"].inputs).toEqual([
			"dokploy_scope",
		]);
		expect(config.sinks["sink_bs-1"].inputs).toEqual(["transform_bs-1"]);
		expect(config.transforms["transform_dd-1"]).toBeDefined();
		expect(config.transforms["transform_dd-1"].inputs).toEqual([
			"dokploy_scope",
		]);
		expect(config.sinks["sink_dd-1"].inputs).toEqual(["transform_dd-1"]);
	});

	it("escapes double quotes in project/application names to avoid breaking the VRL string literal", async () => {
		mocks.findManyProjects.mockResolvedValue([
			{
				projectId: "project-1",
				name: 'My "Project"',
				environments: [
					{
						environmentId: "env-1",
						name: "production",
						applications: [
							{
								appName: "app-abc123",
								applicationId: "application-1",
								name: "app",
							},
						],
						compose: [],
					},
				],
			},
		]);
		mocks.findEnabledLogProvidersByOrganization.mockResolvedValue([]);

		const yamlStr = await buildVectorConfigYaml("org-1");
		const config = parse(yamlStr) as any;

		expect(config.transforms.dokploy_scope.source).toContain(
			'.dokploy_project = "My \\"Project\\""',
		);
	});

	it("replaces every control character in a project name, not just newlines, before embedding it in VRL", async () => {
		mocks.findManyProjects.mockResolvedValue([
			{
				projectId: "project-1",
				name: "Weird\r\x00Name",
				environments: [
					{
						environmentId: "env-1",
						name: "production",
						applications: [
							{
								appName: "app-abc123",
								applicationId: "application-1",
								name: "app",
							},
						],
						compose: [],
					},
				],
			},
		]);
		mocks.findEnabledLogProvidersByOrganization.mockResolvedValue([]);

		const yamlStr = await buildVectorConfigYaml("org-1");
		const config = parse(yamlStr) as any;
		const source = config.transforms.dokploy_scope.source as string;

		expect(source).toContain('.dokploy_project = "Weird  Name"');
	});

	it("keeps events without a matching appName unscoped (no crash, no filtering), with the scoping fields defaulted to empty string", async () => {
		mocks.findManyProjects.mockResolvedValue([]);
		mocks.findEnabledLogProvidersByOrganization.mockResolvedValue([]);

		const yamlStr = await buildVectorConfigYaml("org-1");
		const config = parse(yamlStr) as any;

		expect(config.transforms.dokploy_scope.source).toBe(
			[
				'.dokploy_organization = "org-1"',
				'.dokploy_project = ""',
				'.dokploy_project_id = ""',
				'.dokploy_environment = ""',
				'.dokploy_environment_id = ""',
				'.dokploy_application = ""',
				'.dokploy_application_id = ""',
			].join("\n"),
		);
	});

	it("uses preloaded org data instead of querying, when given (fan-out reuse)", async () => {
		mocks.findManyProjects.mockClear();
		mocks.findEnabledLogProvidersByOrganization.mockClear();

		const yamlStr = await buildVectorConfigYaml("org-1", {
			providers: [],
			lookup: {},
		});

		expect(mocks.findManyProjects).not.toHaveBeenCalled();
		expect(mocks.findEnabledLogProvidersByOrganization).not.toHaveBeenCalled();
		const config = parse(yamlStr) as any;
		expect(config.sinks).toEqual({});
	});

	it("skips a provider whose config an adapter rejects at build time, instead of failing the whole org's config", async () => {
		const yamlStr = await buildVectorConfigYaml("org-1", {
			providers: [
				{
					logProviderId: "broken-es",
					name: "es-broken",
					providerType: "elasticsearch",
					endpoint: "https://es.example.com:9200",
					apiKey: null,
					apiSecret: null,
					extraConfig: { username: "elastic" },
				},
				{
					logProviderId: "good-loki",
					name: "loki-ok",
					providerType: "loki",
					endpoint: "https://loki.example.com",
					apiKey: null,
					apiSecret: null,
					extraConfig: null,
				},
			] as any,
			lookup: {},
		});

		const config = parse(yamlStr) as any;
		expect(Object.keys(config.sinks)).toEqual(["sink_good-loki"]);
	});

	it("dropUnmatched (local host only) filters out events with no matching Dokploy app before any sink", async () => {
		const yamlStr = await buildVectorConfigYaml(
			"org-1",
			{
				providers: [
					{
						logProviderId: "loki-1",
						name: "loki",
						providerType: "loki",
						endpoint: "https://loki.example.com",
						apiKey: null,
						apiSecret: null,
						extraConfig: null,
					},
				] as any,
				lookup: {},
			},
			{ dropUnmatched: true },
		);

		const config = parse(yamlStr) as any;
		expect(config.transforms.dokploy_scope_local_only).toEqual({
			type: "filter",
			inputs: ["dokploy_scope"],
			condition: '.dokploy_project != ""',
		});
		expect(config.sinks["sink_loki-1"].inputs).toEqual([
			"dokploy_scope_local_only",
		]);
	});

	it("does not add the drop-unmatched filter for the per-server (non-local) path", async () => {
		mocks.findManyProjects.mockResolvedValue([]);
		mocks.findEnabledLogProvidersByOrganization.mockResolvedValue([]);

		const yamlStr = await buildVectorConfigYaml("org-1");
		const config = parse(yamlStr) as any;

		expect(config.transforms.dokploy_scope_local_only).toBeUndefined();
	});
});

import { vrlString } from "@dokploy/server/services/logs-and-metrics/types";
import {
	buildMetricsScopeTransformSource,
	buildVectorConfigYaml,
	collectSecretValues,
	redactSecrets,
} from "@dokploy/server/setup/vector-setup";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const provider = (overrides: Record<string, unknown>) =>
	({
		apiKey: null,
		apiSecret: null,
		endpoint: null,
		extraConfig: null,
		signals: ["logs"],
		...overrides,
	}) as any;

const loki = provider({
	telemetryProviderId: "loki-1",
	name: "loki",
	providerType: "loki",
	endpoint: "https://loki.example.com",
});

const prom = provider({
	telemetryProviderId: "prom-1",
	name: "prom",
	providerType: "prometheus_remote_write",
	signals: ["metrics"],
	endpoint: "http://prom.example.com:9090/api/v1/write",
});

const datadog = provider({
	telemetryProviderId: "dd-1",
	name: "datadog",
	providerType: "datadog",
	signals: ["logs", "metrics"],
	apiKey: "dd-key",
});

const build = (
	overrides: Partial<Parameters<typeof buildVectorConfigYaml>[0]>,
) =>
	parse(
		buildVectorConfigYaml({
			logProviders: [],
			metricsProviders: [],
			serverName: "my server",
			...overrides,
		}),
	) as any;

describe("buildVectorConfigYaml — logs", () => {
	it("generates a source, a dokploy_scope transform and one sink per provider, and nothing for metrics", () => {
		const config = build({ logProviders: [loki] });

		expect(config.data_dir).toBe("/var/lib/vector");
		expect(config.sources.docker_logs_source.type).toBe("docker_logs");
		expect(config.transforms.dokploy_scope.type).toBe("remap");
		expect(config.transforms.dokploy_scope.inputs).toEqual([
			"docker_logs_source",
		]);
		expect(Object.keys(config.sinks)).toEqual(["sink_loki-1"]);
		expect(config.sinks["sink_loki-1"].type).toBe("loki");
		expect(config.sinks["sink_loki-1"].inputs).toEqual(["dokploy_scope"]);

		expect(config.sources.host_metrics_source).toBeUndefined();
		expect(config.sources.cadvisor_source).toBeUndefined();
		expect(config.transforms.dokploy_metrics_scope).toBeUndefined();
	});

	it("chains scope -> transform -> sink for betterstack/datadog, and scope -> sink direct for loki", () => {
		const config = build({
			logProviders: [
				loki,
				provider({
					telemetryProviderId: "bs-1",
					name: "betterstack",
					providerType: "betterstack",
					endpoint: "https://in.logs.betterstack.com",
					apiKey: "token",
				}),
				datadog,
			],
		});

		expect(config.sinks["sink_loki-1"].inputs).toEqual(["dokploy_scope"]);
		expect(config.transforms["transform_bs-1"].inputs).toEqual([
			"dokploy_scope",
		]);
		expect(config.sinks["sink_bs-1"].inputs).toEqual(["transform_bs-1"]);
		expect(config.transforms["transform_dd-1"].inputs).toEqual([
			"dokploy_scope",
		]);
		expect(config.sinks["sink_dd-1"].inputs).toEqual(["transform_dd-1"]);
	});

	it("tags every log with the server name and reads the Dokploy metadata straight off the container labels, with empty defaults for containers Dokploy did not deploy", () => {
		const config = build({ logProviders: [loki], serverName: 'srv "quoted"' });

		expect(config.transforms.dokploy_scope.source).toBe(
			[
				'.dokploy_server = "srv \\"quoted\\""',
				'.dokploy_organization = .label."dokploy.organization.id" || ""',
				'.dokploy_project = .label."dokploy.project" || ""',
				'.dokploy_project_id = .label."dokploy.project.id" || ""',
				'.dokploy_environment = .label."dokploy.environment" || ""',
				'.dokploy_environment_id = .label."dokploy.environment.id" || ""',
				'.dokploy_application = .label."dokploy.application" || ""',
				'.dokploy_application_id = .label."dokploy.application.id" || ""',
				'.dokploy_service = .label."dokploy.service" || ""',
			].join("\n"),
		);
	});

	it("skips a provider whose config an adapter rejects at build time, instead of failing the whole org's config", () => {
		const config = build({
			logProviders: [
				provider({
					telemetryProviderId: "broken-es",
					name: "es-broken",
					providerType: "elasticsearch",
					endpoint: "https://es.example.com:9200",
					extraConfig: { username: "elastic" },
				}),
				loki,
			],
		});

		expect(Object.keys(config.sinks)).toEqual(["sink_loki-1"]);
	});

	it("only keeps containers of the owning organization on the local host, which is shared by every organization", () => {
		const config = build({ logProviders: [loki], organizationId: "org-a" });

		expect(config.transforms.dokploy_scope_local_only).toEqual({
			type: "filter",
			inputs: ["dokploy_scope"],
			condition: '.dokploy_organization == "org-a"',
		});
		expect(config.sinks["sink_loki-1"].inputs).toEqual([
			"dokploy_scope_local_only",
		]);
	});

	it("does not add the organization filter for the per-server (non-local) path", () => {
		const config = build({ logProviders: [loki] });

		expect(config.transforms.dokploy_scope_local_only).toBeUndefined();
	});
});

describe("buildVectorConfigYaml — metrics", () => {
	it("with only metrics providers it emits the host and cAdvisor sources and no logs pipeline", () => {
		const config = build({ metricsProviders: [prom] });

		expect(config.sources.docker_logs_source).toBeUndefined();
		expect(config.transforms.dokploy_scope).toBeUndefined();
		expect(config.sources.host_metrics_source).toMatchObject({
			type: "host_metrics",
			scrape_interval_secs: 30,
			collectors: [
				"cpu",
				"memory",
				"disk",
				"filesystem",
				"network",
				"load",
				"host",
			],
		});
		expect(
			config.sources.host_metrics_source.filesystem.filesystems.excludes,
		).toEqual(
			expect.arrayContaining([
				"overlay",
				"tmpfs",
				"squashfs",
				"devtmpfs",
				"nsfs",
				"proc",
				"sysfs",
				"devpts",
				"cgroup2",
			]),
		);
		expect(config.sources.host_metrics_source.network.devices.excludes).toEqual(
			["veth*", "br-*", "docker*"],
		);
		expect(config.sources.cadvisor_source).toEqual({
			type: "prometheus_scrape",
			endpoints: ["http://127.0.0.1:4510/metrics"],
			scrape_interval_secs: 30,
			scrape_timeout_secs: 10,
		});
		expect(config.transforms.dokploy_metrics_scope).toMatchObject({
			type: "remap",
			inputs: ["host_metrics_source", "cadvisor_source"],
			drop_on_abort: true,
		});
		expect(Object.keys(config.sinks)).toEqual(["sink_prom-1_metrics"]);
		expect(config.sinks["sink_prom-1_metrics"]).toMatchObject({
			type: "prometheus_remote_write",
			inputs: ["dokploy_metrics_scope"],
		});
		expect(config.transforms.dokploy_metrics_scope_local_only).toBeUndefined();
	});

	it("on the local host it lets host series through and keeps only the owning organization's containers", () => {
		const config = build({ metricsProviders: [prom], organizationId: "org-a" });

		expect(config.transforms.dokploy_metrics_scope_local_only).toEqual({
			type: "filter",
			inputs: ["dokploy_metrics_scope"],
			condition:
				'.namespace == "host" || .tags.dokploy_organization == "org-a"',
		});
		expect(config.sinks["sink_prom-1_metrics"].inputs).toEqual([
			"dokploy_metrics_scope_local_only",
		]);
	});

	it("a provider assigned to both signals gets a logs sink and a metrics sink without clashing", () => {
		const config = build({
			logProviders: [datadog],
			metricsProviders: [datadog],
			organizationId: "org-a",
		});

		expect(config.sinks["sink_dd-1"]).toMatchObject({
			type: "datadog_logs",
			inputs: ["transform_dd-1"],
		});
		expect(config.sinks["sink_dd-1_metrics"]).toMatchObject({
			type: "datadog_metrics",
			inputs: ["dokploy_metrics_scope_local_only"],
		});
		expect(config.transforms["transform_dd-1_metrics"]).toBeUndefined();
	});

	it("tags every series with the server name, promotes non-empty dokploy labels and drops the cgroup id", () => {
		const source = buildMetricsScopeTransformSource('srv "quoted"');

		expect(source).toContain('.tags.dokploy_server = "srv \\"quoted\\""');
		expect(source).toContain(
			'if .namespace != "host" && !starts_with(string!(.name), "container_") { abort }',
		);
		expect(source).toContain(
			'value = del(.tags.container_label_dokploy_application)\nif is_string(value) && value != "" { .tags.dokploy_application = value }',
		);
		expect(source.trim().endsWith("del(.tags.id)")).toBe(true);
		expect(
			build({ metricsProviders: [prom] }).transforms.dokploy_metrics_scope
				.source,
		).toBe(buildMetricsScopeTransformSource("my server"));
	});
});

describe("buildVectorConfigYaml — dollar signs", () => {
	it("keeps every $ literal because the agent runs without env var interpolation", () => {
		const yamlStr = buildVectorConfigYaml({
			logProviders: [
				provider({
					telemetryProviderId: "loki-1",
					name: "loki",
					providerType: "loki",
					endpoint: "https://loki.example.com",
					apiKey: "Pa$5w0rd$HOME",
					extraConfig: { username: "12345" },
				}),
			],
			metricsProviders: [prom],
			serverName: "srv $ONE",
		});

		expect(yamlStr).not.toContain("$$");
		expect(yamlStr).toContain("srv $ONE");
		expect(parse(yamlStr).sinks["sink_loki-1"].auth.password).toBe(
			"Pa$5w0rd$HOME",
		);
	});
});

describe("collectSecretValues / redactSecrets", () => {
	it("collects endpoint/apiKey/apiSecret across all providers but only the password-type extraConfig fields", () => {
		const providers = [
			{
				providerType: "loki",
				endpoint: "https://loki.example.com",
				apiKey: "loki-key",
				apiSecret: null,
				extraConfig: { tenantId: "tenant-a", username: "12345" },
			},
			{
				providerType: "datadog",
				endpoint: null,
				apiKey: "dd-key",
				apiSecret: null,
				extraConfig: { site: "datadoghq.eu" },
			},
			{
				providerType: "aws_cloudwatch",
				endpoint: null,
				apiKey: "AKIA",
				apiSecret: "shh",
				extraConfig: { region: "us-east-1", metricsNamespace: "Dokploy" },
			},
		] as any;

		const values = collectSecretValues(providers);
		expect(values).toEqual(
			expect.arrayContaining([
				"https://loki.example.com",
				"loki-key",
				"dd-key",
				"AKIA",
				"shh",
			]),
		);
		for (const plain of [
			"tenant-a",
			"12345",
			"datadoghq.eu",
			"us-east-1",
			"Dokploy",
		]) {
			expect(values).not.toContain(plain);
		}
	});

	it("ignores null/empty credentials", () => {
		const providers = [
			{
				providerType: "elasticsearch",
				endpoint: null,
				apiKey: null,
				apiSecret: null,
				extraConfig: { limit: 10, enabled: true, empty: "" },
			},
		] as any;
		expect(collectSecretValues(providers)).toEqual([]);
	});

	it("redacts every collected secret, longest first so a short one can't eat part of a longer one", () => {
		const providers = [
			{
				providerType: "loki",
				endpoint: null,
				apiKey: "hunter2-long-suffix",
				apiSecret: "hunter2",
				extraConfig: null,
			},
		] as any;
		const text =
			"sink validation error near apiKey=hunter2-long-suffix and hunter2";

		const redacted = redactSecrets(text, collectSecretValues(providers));

		expect(redacted).not.toContain("hunter2");
		expect(redacted).toBe(
			"sink validation error near apiKey=[redacted] and [redacted]",
		);
	});
});

describe("vrlString", () => {
	it("quotes and escapes like JSON but drops the control characters VRL rejects", () => {
		expect(vrlString('my "server"')).toBe('"my \\"server\\""');
		expect(vrlString("back\\slash")).toBe('"back\\\\slash"');
		expect(vrlString("a\u0008b\u000cc\u0000d\u007fe\nf")).toBe('"abcdef"');
	});
});

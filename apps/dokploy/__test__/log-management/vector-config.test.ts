import { buildVectorConfigYaml } from "@dokploy/server/setup/vector-setup";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const provider = (overrides: Record<string, unknown>) =>
	({
		apiKey: null,
		apiSecret: null,
		endpoint: null,
		extraConfig: null,
		...overrides,
	}) as any;

describe("buildVectorConfigYaml", () => {
	it("generates a source, a dokploy_scope transform and one sink per enabled provider", async () => {
		const yamlStr = await buildVectorConfigYaml([
			provider({
				logProviderId: "log-provider-1",
				name: "loki-prod",
				providerType: "loki",
				endpoint: "https://loki.example.com",
			}),
		]);
		const config = parse(yamlStr) as any;

		expect(config.data_dir).toBe("/var/lib/vector");
		expect(config.sources.docker_logs_source.type).toBe("docker_logs");
		expect(config.transforms.dokploy_scope.type).toBe("remap");
		expect(config.transforms.dokploy_scope.inputs).toEqual([
			"docker_logs_source",
		]);

		const sinkIds = Object.keys(config.sinks);
		expect(sinkIds).toEqual(["sink_log-provider-1"]);
		expect(config.sinks["sink_log-provider-1"].type).toBe("loki");
		expect(config.sinks["sink_log-provider-1"].inputs).toEqual([
			"dokploy_scope",
		]);
	});

	it("chains scope -> transform -> sink for betterstack/datadog, and scope -> sink direct for loki", async () => {
		const yamlStr = await buildVectorConfigYaml([
			provider({
				logProviderId: "loki-1",
				name: "loki",
				providerType: "loki",
				endpoint: "https://loki.example.com",
			}),
			provider({
				logProviderId: "bs-1",
				name: "betterstack",
				providerType: "betterstack",
				endpoint: "https://in.logs.betterstack.com",
				apiKey: "token",
			}),
			provider({
				logProviderId: "dd-1",
				name: "datadog",
				providerType: "datadog",
				apiKey: "dd-key",
			}),
		]);
		const config = parse(yamlStr) as any;

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

	it("reads the Dokploy metadata straight off the container labels, with empty defaults for containers Dokploy did not deploy", async () => {
		const yamlStr = await buildVectorConfigYaml([]);
		const config = parse(yamlStr) as any;

		expect(config.transforms.dokploy_scope.source).toBe(
			[
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

	it("skips a provider whose config an adapter rejects at build time, instead of failing the whole org's config", async () => {
		const yamlStr = await buildVectorConfigYaml([
			provider({
				logProviderId: "broken-es",
				name: "es-broken",
				providerType: "elasticsearch",
				endpoint: "https://es.example.com:9200",
				extraConfig: { username: "elastic" },
			}),
			provider({
				logProviderId: "good-loki",
				name: "loki-ok",
				providerType: "loki",
				endpoint: "https://loki.example.com",
			}),
		]);

		const config = parse(yamlStr) as any;
		expect(Object.keys(config.sinks)).toEqual(["sink_good-loki"]);
	});

	it("drops containers Dokploy did not deploy on the local host, which also runs unrelated containers", async () => {
		const yamlStr = await buildVectorConfigYaml(
			[
				provider({
					logProviderId: "loki-1",
					name: "loki",
					providerType: "loki",
					endpoint: "https://loki.example.com",
				}),
			],
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
		const yamlStr = await buildVectorConfigYaml([]);
		const config = parse(yamlStr) as any;

		expect(config.transforms.dokploy_scope_local_only).toBeUndefined();
	});
});

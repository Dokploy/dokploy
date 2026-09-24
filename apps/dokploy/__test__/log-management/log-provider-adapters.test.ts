import {
	getLogProviderAdapter,
	logProviderAdapters,
} from "@dokploy/server/services/log-management/providers/registry";
import type { LogProviderRuntimeConfig } from "@dokploy/server/services/log-management/types";
import { describe, expect, it } from "vitest";

const baseConfig: LogProviderRuntimeConfig = {
	logProviderId: "log-provider-1",
	name: "test",
	endpoint: null,
	apiKey: null,
	apiSecret: null,
	extraConfig: null,
};

describe("getLogProviderAdapter", () => {
	it("returns the registered adapter for each known type", () => {
		expect(getLogProviderAdapter("loki").type).toBe("loki");
		expect(getLogProviderAdapter("datadog").type).toBe("datadog");
		expect(getLogProviderAdapter("betterstack").type).toBe("betterstack");
		expect(getLogProviderAdapter("elasticsearch").type).toBe("elasticsearch");
		expect(getLogProviderAdapter("splunk_hec").type).toBe("splunk_hec");
		expect(getLogProviderAdapter("aws_cloudwatch").type).toBe("aws_cloudwatch");
	});

	it("throws an explicit error for an unregistered type", () => {
		// @ts-expect-error: intentionally an unregistered type
		expect(() => getLogProviderAdapter("unknown")).toThrow(
			/No LogProviderAdapter registered/,
		);
	});
});

describe("lokiAdapter.toVectorSink", () => {
	it("maps endpoint + labels, without tenant_id if not set", () => {
		const adapter = logProviderAdapters.loki;
		const sink = adapter.toVectorSink(
			{ ...baseConfig, endpoint: "https://loki.example.com" },
			"sink_1",
			"dokploy_scope",
		);
		expect(sink.type).toBe("loki");
		expect(sink.inputs).toEqual(["dokploy_scope"]);
		expect(sink.endpoint).toBe("https://loki.example.com");
		expect(sink.labels).toMatchObject({
			dokploy_project: "{{ dokploy_project }}",
			dokploy_application: "{{ dokploy_application }}",
			dokploy_organization: "{{ dokploy_organization }}",
		});
		expect(sink.tenant_id).toBeUndefined();
		expect(sink.buffer).toEqual({
			type: "disk",
			max_size: 268_435_488,
			when_full: "block",
		});
	});

	it("includes tenant_id when present in extraConfig", () => {
		const adapter = logProviderAdapters.loki;
		const sink = adapter.toVectorSink(
			{
				...baseConfig,
				endpoint: "https://loki.example.com",
				extraConfig: { tenantId: "tenant-a" },
			},
			"sink_1",
			"dokploy_scope",
		);
		expect(sink.tenant_id).toBe("tenant-a");
	});

	it("has no toVectorTransform — goes directly scope -> sink", () => {
		expect(logProviderAdapters.loki.toVectorTransform).toBeUndefined();
	});
});

describe("datadogAdapter.toVectorSink", () => {
	it("defaults site to datadoghq.com, no `tags` field (datadog_logs no lo soporta)", () => {
		const adapter = logProviderAdapters.datadog;
		const sink = adapter.toVectorSink(
			{ ...baseConfig, apiKey: "dd-key" },
			"sink_2",
			"transform_2",
		);
		expect(sink.type).toBe("datadog_logs");
		expect(sink.default_api_key).toBe("dd-key");
		expect(sink.site).toBe("datadoghq.com");
		expect(sink.tags).toBeUndefined();
		expect(sink.inputs).toEqual(["transform_2"]);
	});

	it("uses extraConfig.site when present", () => {
		const adapter = logProviderAdapters.datadog;
		const sink = adapter.toVectorSink(
			{
				...baseConfig,
				apiKey: "dd-key",
				extraConfig: { site: "datadoghq.eu" },
			},
			"sink_2",
			"transform_2",
		);
		expect(sink.site).toBe("datadoghq.eu");
	});

	it("strips a pasted scheme/trailing slash from extraConfig.site instead of interpolating it as-is", () => {
		const adapter = logProviderAdapters.datadog;
		const sink = adapter.toVectorSink(
			{
				...baseConfig,
				apiKey: "dd-key",
				extraConfig: { site: "https://datadoghq.eu/" },
			},
			"sink_2",
			"transform_2",
		);
		expect(sink.site).toBe("datadoghq.eu");
	});

	it("has toVectorTransform to build .ddtags from the scoping fields — confirmado que datadog_logs no tiene un campo `tags` de config (vector generate-schema)", () => {
		const adapter = logProviderAdapters.datadog;
		expect(adapter.toVectorTransform).toBeDefined();
		const transform = adapter.toVectorTransform?.(
			baseConfig,
			"transform_2",
			"dokploy_scope",
		);
		expect(transform?.type).toBe("remap");
		expect(transform?.inputs).toEqual(["dokploy_scope"]);
		expect(transform?.source).toContain(".ddtags");
	});

	it("escapes commas in scoping field values before building .ddtags, since ddtags is itself comma delimited", () => {
		const adapter = logProviderAdapters.datadog;
		const transform = adapter.toVectorTransform?.(
			baseConfig,
			"transform_2",
			"dokploy_scope",
		);
		expect(transform?.source).toContain(
			'replace(to_string!(.dokploy_project), ",", "_")',
		);
	});
});

describe("betterStackAdapter", () => {
	it("toVectorTransform renames timestamp to dt, inputs point to scope transform", () => {
		const adapter = logProviderAdapters.betterstack;
		expect(adapter.toVectorTransform).toBeDefined();
		const transform = adapter.toVectorTransform?.(
			baseConfig,
			"transform_1",
			"dokploy_scope",
		);
		expect(transform).toEqual({
			type: "remap",
			inputs: ["dokploy_scope"],
			source: ".dt = del(.timestamp)",
		});
	});

	it("toVectorSink builds a generic http sink with bearer auth, reading from the transform id", () => {
		const adapter = logProviderAdapters.betterstack;
		const sink = adapter.toVectorSink(
			{
				...baseConfig,
				endpoint: "https://in.logs.betterstack.com",
				apiKey: "source-token",
			},
			"sink_3",
			"transform_1",
		);
		expect(sink.type).toBe("http");
		expect(sink.inputs).toEqual(["transform_1"]);
		expect(sink.uri).toBe("https://in.logs.betterstack.com/");
		expect(sink.auth).toEqual({ strategy: "bearer", token: "source-token" });
		expect(sink.compression).toBe("gzip");
	});
});

describe("elasticsearchAdapter", () => {
	it("has a toVectorTransform that flattens .label to a JSON string", () => {
		const adapter = logProviderAdapters.elasticsearch;
		expect(adapter.toVectorTransform).toBeDefined();
		const transform = adapter.toVectorTransform?.(
			baseConfig,
			"transform_4",
			"dokploy_scope",
		);
		expect(transform?.type).toBe("remap");
		expect(transform?.inputs).toEqual(["dokploy_scope"]);
		expect(transform?.source).toContain("encode_json(.label)");
	});

	it("uses basic auth when a username is set", () => {
		const adapter = logProviderAdapters.elasticsearch;
		const sink = adapter.toVectorSink(
			{
				...baseConfig,
				endpoint: "https://es.example.com:9200",
				apiKey: "secret",
				extraConfig: { username: "elastic" },
			},
			"sink_4",
			"dokploy_scope",
		);
		expect(sink.type).toBe("elasticsearch");
		expect(sink.endpoints).toEqual(["https://es.example.com:9200"]);
		expect(sink.auth).toEqual({
			strategy: "basic",
			user: "elastic",
			password: "secret",
		});
		expect(sink.request).toBeUndefined();
	});

	it("falls back to an ApiKey header when no username is set", () => {
		const adapter = logProviderAdapters.elasticsearch;
		const sink = adapter.toVectorSink(
			{
				...baseConfig,
				endpoint: "https://es.example.com:9200",
				apiKey: "key-123",
			},
			"sink_4",
			"dokploy_scope",
		);
		expect(sink.auth).toBeUndefined();
		expect(sink.request).toEqual({
			headers: { Authorization: "ApiKey key-123" },
		});
	});

	it("rejects a username set without a password instead of silently shipping unauthenticated", () => {
		const adapter = logProviderAdapters.elasticsearch;
		expect(() =>
			adapter.toVectorSink(
				{
					...baseConfig,
					endpoint: "https://es.example.com:9200",
					extraConfig: { username: "elastic" },
				},
				"sink_4",
				"dokploy_scope",
			),
		).toThrow(/Password.*required/i);
	});

	it("includes bulk.index only when extraConfig.index is set", () => {
		const adapter = logProviderAdapters.elasticsearch;
		const withoutIndex = adapter.toVectorSink(
			{ ...baseConfig, endpoint: "https://es.example.com:9200" },
			"sink_4",
			"dokploy_scope",
		);
		expect(withoutIndex.bulk).toBeUndefined();
		const withIndex = adapter.toVectorSink(
			{
				...baseConfig,
				endpoint: "https://es.example.com:9200",
				extraConfig: { index: "dokploy-%Y.%m.%d" },
			},
			"sink_4",
			"dokploy_scope",
		);
		expect(withIndex.bulk).toEqual({ index: "dokploy-%Y.%m.%d" });
	});
});

describe("splunkAdapter", () => {
	it("has no toVectorTransform — scoping fields ride along as plain JSON fields", () => {
		expect(logProviderAdapters.splunk_hec.toVectorTransform).toBeUndefined();
	});

	it("toVectorSink maps endpoint/token, only sets index/sourcetype when present", () => {
		const adapter = logProviderAdapters.splunk_hec;
		const sink = adapter.toVectorSink(
			{
				...baseConfig,
				endpoint: "https://splunk.example.com:8088",
				apiKey: "hec-token",
			},
			"sink_5",
			"dokploy_scope",
		);
		expect(sink.type).toBe("splunk_hec_logs");
		expect(sink.endpoint).toBe("https://splunk.example.com:8088");
		expect(sink.default_token).toBe("hec-token");
		expect(sink.encoding).toEqual({ codec: "json" });
		expect(sink.index).toBeUndefined();
		expect(sink.sourcetype).toBeUndefined();

		const withExtras = adapter.toVectorSink(
			{
				...baseConfig,
				endpoint: "https://splunk.example.com:8088",
				apiKey: "hec-token",
				extraConfig: { index: "dokploy", sourcetype: "docker" },
			},
			"sink_5",
			"dokploy_scope",
		);
		expect(withExtras.index).toBe("dokploy");
		expect(withExtras.sourcetype).toBe("docker");
	});
});

describe("awsCloudwatchAdapter", () => {
	it("has no toVectorTransform — scoping fields ride along as plain JSON fields", () => {
		expect(
			logProviderAdapters.aws_cloudwatch.toVectorTransform,
		).toBeUndefined();
	});

	it("toVectorSink maps access key/secret, region and log group/stream", () => {
		const adapter = logProviderAdapters.aws_cloudwatch;
		const sink = adapter.toVectorSink(
			{
				...baseConfig,
				apiKey: "AKIA...",
				apiSecret: "shh",
				extraConfig: { region: "us-east-1", logGroup: "/dokploy/logs" },
			},
			"sink_6",
			"dokploy_scope",
		);
		expect(sink.type).toBe("aws_cloudwatch_logs");
		expect(sink.group_name).toBe("/dokploy/logs");
		expect(sink.stream_name).toBe("{{ container_name }}");
		expect(sink.region).toBe("us-east-1");
		expect(sink.auth).toEqual({
			access_key_id: "AKIA...",
			secret_access_key: "shh",
		});
	});

	it("uses extraConfig.logStream as the stream template when set", () => {
		const adapter = logProviderAdapters.aws_cloudwatch;
		const sink = adapter.toVectorSink(
			{
				...baseConfig,
				apiKey: "AKIA...",
				apiSecret: "shh",
				extraConfig: {
					region: "us-east-1",
					logGroup: "/dokploy/logs",
					logStream: "{{ dokploy_application }}",
				},
			},
			"sink_6",
			"dokploy_scope",
		);
		expect(sink.stream_name).toBe("{{ dokploy_application }}");
	});
});

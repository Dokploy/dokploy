import {
	getTelemetryProviderAdapter,
	telemetryProviderAdapters,
} from "@dokploy/server/services/logs-and-metrics/providers/registry";
import type { TelemetryProviderRuntimeConfig } from "@dokploy/server/services/logs-and-metrics/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => ({
	describeLogGroups: vi.fn(),
	putMetricData: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
	lookup: async () => [{ address: "93.184.216.34" }],
}));
vi.mock("@aws-sdk/client-cloudwatch-logs", () => ({
	CloudWatchLogsClient: class {
		send = aws.describeLogGroups;
	},
	DescribeLogGroupsCommand: class {
		constructor(public input: unknown) {}
	},
}));
vi.mock("@aws-sdk/client-cloudwatch", () => ({
	CloudWatchClient: class {
		send = aws.putMetricData;
	},
	PutMetricDataCommand: class {
		constructor(public input: unknown) {}
	},
}));

const baseConfig: TelemetryProviderRuntimeConfig = {
	telemetryProviderId: "provider-1",
	name: "test",
	signals: ["metrics"],
	endpoint: null,
	apiKey: null,
	apiSecret: null,
	extraConfig: null,
};

const originalFetch = global.fetch;
const fetchMock = vi.fn();

const respond = (status: number, body: unknown = "") =>
	new Response(
		status === 204
			? null
			: typeof body === "string"
				? body
				: JSON.stringify(body),
		{ status },
	);

beforeEach(() => {
	fetchMock.mockReset();
	aws.describeLogGroups.mockReset();
	aws.putMetricData.mockReset();
	global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
	global.fetch = originalFetch;
});

const calledUrls = () => fetchMock.mock.calls.map((call) => String(call[0]));

describe("registry", () => {
	it("resolves the nine provider types, each with a non-empty valid signal list", () => {
		const types = [
			"loki",
			"prometheus_remote_write",
			"new_relic",
			"influxdb",
			"datadog",
			"aws_cloudwatch",
			"splunk_hec",
			"elasticsearch",
			"betterstack",
		] as const;
		expect(Object.keys(telemetryProviderAdapters).sort()).toEqual(
			[...types].sort(),
		);
		for (const type of types) {
			const adapter = getTelemetryProviderAdapter(type);
			expect(adapter.type).toBe(type);
			expect(adapter.signals.length).toBeGreaterThan(0);
			expect(
				adapter.signals.every((s) => s === "logs" || s === "metrics"),
			).toBe(true);
		}
		expect(telemetryProviderAdapters.loki.signals).toEqual(["logs"]);
		expect(telemetryProviderAdapters.prometheus_remote_write.signals).toEqual([
			"metrics",
		]);
		expect(telemetryProviderAdapters.datadog.signals).toEqual([
			"logs",
			"metrics",
		]);
	});
});

describe("prometheusRemoteWriteAdapter", () => {
	const adapter = telemetryProviderAdapters.prometheus_remote_write;
	const endpoint = "http://prom.example.com:9090/api/v1/write";

	it("builds a sink without auth, with the healthcheck disabled", () => {
		const sink = adapter.toVectorSink(
			{ ...baseConfig, endpoint },
			"sink_1",
			"dokploy_metrics_scope",
			"metrics",
		);
		expect(sink).toMatchObject({
			type: "prometheus_remote_write",
			inputs: ["dokploy_metrics_scope"],
			endpoint,
			healthcheck: { enabled: false },
		});
		expect(sink.auth).toBeUndefined();
		expect(sink.tenant_id).toBeUndefined();
	});

	it("uses basic auth with a username, bearer with a token alone, and sets tenant_id", () => {
		const basic = adapter.toVectorSink(
			{
				...baseConfig,
				endpoint,
				apiKey: "pw",
				extraConfig: { username: "12345", tenantId: "team-a" },
			},
			"sink_1",
			"scope",
			"metrics",
		);
		expect(basic.auth).toEqual({
			strategy: "basic",
			user: "12345",
			password: "pw",
		});
		expect(basic.tenant_id).toBe("team-a");

		const bearer = adapter.toVectorSink(
			{ ...baseConfig, endpoint, apiKey: "tok" },
			"sink_1",
			"scope",
			"metrics",
		);
		expect(bearer.auth).toEqual({ strategy: "bearer", token: "tok" });
	});

	it("rejects an endpoint that is not an http(s) URL", () => {
		expect(() =>
			adapter.validateConfig?.({ ...baseConfig, endpoint: "not a url" }),
		).toThrow(/valid http\(s\) URL/);
		expect(() =>
			adapter.validateConfig?.({ ...baseConfig, endpoint: "ftp://x" }),
		).toThrow(/valid http\(s\) URL/);
	});

	it("treats 2xx and 400 as success and gives distinct errors for 401 and 404", async () => {
		fetchMock.mockResolvedValueOnce(respond(204));
		await expect(
			adapter.testConnection?.({ ...baseConfig, endpoint }),
		).resolves.toBeUndefined();

		fetchMock.mockResolvedValueOnce(respond(400));
		await expect(
			adapter.testConnection?.({ ...baseConfig, endpoint }),
		).resolves.toBeUndefined();

		fetchMock.mockResolvedValueOnce(respond(401));
		await expect(
			adapter.testConnection?.({ ...baseConfig, endpoint, apiKey: "bad" }),
		).rejects.toThrow(/rejected the credentials \(status 401\)/);

		fetchMock.mockResolvedValueOnce(respond(404));
		await expect(
			adapter.testConnection?.({ ...baseConfig, endpoint }),
		).rejects.toThrow(/not found at this URL \(status 404\)/);
	});

	it("sends the auth header and the tenant header on the test request", async () => {
		fetchMock.mockResolvedValueOnce(respond(204));
		await adapter.testConnection?.({
			...baseConfig,
			endpoint,
			apiKey: "tok",
			extraConfig: { tenantId: "team-a" },
		});
		const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(init.method).toBe("POST");
		expect(init.headers).toMatchObject({
			Authorization: "Bearer tok",
			"X-Scope-OrgID": "team-a",
		});
	});
});

describe("newRelicAdapter", () => {
	const adapter = telemetryProviderAdapters.new_relic;
	const config = {
		...baseConfig,
		apiKey: "license",
		extraConfig: { accountId: "123" },
	};

	it("defaults to the us region and accepts eu", () => {
		expect(adapter.toVectorSink(config, "s", "scope", "metrics")).toMatchObject(
			{
				type: "new_relic",
				api: "metrics",
				license_key: "license",
				account_id: "123",
				region: "us",
			},
		);
		expect(
			adapter.toVectorSink(
				{ ...config, extraConfig: { accountId: "123", region: "EU" } },
				"s",
				"scope",
				"metrics",
			).region,
		).toBe("eu");
	});

	it("rejects an unknown region", () => {
		expect(() =>
			adapter.validateConfig?.({
				...config,
				extraConfig: { accountId: "123", region: "jp" },
			}),
		).toThrow(/"us" or "eu"/);
	});

	it("posts a gauge to the regional metric API: 202 passes, 403 is an invalid key", async () => {
		fetchMock.mockResolvedValueOnce(respond(202));
		await expect(
			adapter.testConnection?.({
				...config,
				extraConfig: { accountId: "123", region: "eu" },
			}),
		).resolves.toBeUndefined();
		expect(calledUrls()[0]).toBe(
			"https://metric-api.eu.newrelic.com/metric/v1",
		);

		fetchMock.mockResolvedValueOnce(respond(403));
		await expect(adapter.testConnection?.(config)).rejects.toThrow(
			/rejected the license key/,
		);
		expect(calledUrls()[1]).toBe("https://metric-api.newrelic.com/metric/v1");
	});
});

describe("influxdbAdapter", () => {
	const adapter = telemetryProviderAdapters.influxdb;
	const config = {
		...baseConfig,
		endpoint: "http://influx.example.com:8086",
		apiKey: "token",
		extraConfig: { org: "dokploy", bucket: "metrics" },
	};

	it("builds an influxdb_metrics v2 sink", () => {
		expect(adapter.toVectorSink(config, "s", "scope", "metrics")).toEqual({
			type: "influxdb_metrics",
			inputs: ["scope"],
			endpoint: "http://influx.example.com:8086",
			org: "dokploy",
			bucket: "metrics",
			token: "token",
			default_namespace: "dokploy",
			version: "2",
			buffer: { type: "disk", max_size: 268_435_488, when_full: "block" },
		});
	});

	it("writes a test point: 204 passes, 401 and 404 give distinct errors", async () => {
		fetchMock.mockResolvedValueOnce(respond(204));
		await expect(adapter.testConnection?.(config)).resolves.toBeUndefined();
		expect(calledUrls()[0]).toBe(
			"http://influx.example.com:8086/api/v2/write?org=dokploy&bucket=metrics&precision=s",
		);

		fetchMock.mockResolvedValueOnce(respond(401));
		await expect(adapter.testConnection?.(config)).rejects.toThrow(
			/rejected the token/,
		);

		fetchMock.mockResolvedValueOnce(respond(404));
		await expect(adapter.testConnection?.(config)).rejects.toThrow(
			/organization or bucket not found/,
		);
	});
});

describe("datadogAdapter with metrics", () => {
	const adapter = telemetryProviderAdapters.datadog;
	const config = {
		...baseConfig,
		signals: ["logs", "metrics"] as const,
		apiKey: "dd",
	};

	it("ships metrics through datadog_metrics without a transform", () => {
		expect(
			adapter.toVectorTransform?.(config as never, "t", "scope", "metrics"),
		).toBeNull();
		expect(
			adapter.toVectorSink(config as never, "s", "scope", "metrics"),
		).toMatchObject({
			type: "datadog_metrics",
			inputs: ["scope"],
			default_api_key: "dd",
			site: "datadoghq.com",
		});
	});

	it("keeps the logs sink and ddtags transform unchanged", () => {
		expect(
			adapter.toVectorTransform?.(config as never, "t", "scope", "logs"),
		).toMatchObject({ type: "remap", inputs: ["scope"] });
		expect(adapter.toVectorSink(config as never, "s", "t", "logs").type).toBe(
			"datadog_logs",
		);
	});
});

describe("betterStackAdapter with metrics", () => {
	const adapter = telemetryProviderAdapters.betterstack;
	const config = {
		...baseConfig,
		endpoint: "in.logs.betterstack.com",
		apiKey: "token",
	};

	it("posts metrics to /metrics without a transform", () => {
		expect(
			adapter.toVectorTransform?.(config, "t", "scope", "metrics"),
		).toBeNull();
		expect(adapter.toVectorSink(config, "s", "scope", "metrics")).toMatchObject(
			{
				type: "http",
				uri: "https://in.logs.betterstack.com/metrics",
				auth: { strategy: "bearer", token: "token" },
			},
		);
		expect(adapter.toVectorSink(config, "s", "scope", "logs").uri).toBe(
			"https://in.logs.betterstack.com/",
		);
	});

	it("tests each selected signal: two requests for logs and metrics, one for logs only", async () => {
		fetchMock.mockResolvedValue(respond(202));
		await adapter.testConnection?.({ ...config, signals: ["logs", "metrics"] });
		expect(calledUrls()).toEqual([
			"https://in.logs.betterstack.com/",
			"https://in.logs.betterstack.com/metrics",
		]);

		fetchMock.mockClear();
		await adapter.testConnection?.({ ...config, signals: ["logs"] });
		expect(calledUrls()).toEqual(["https://in.logs.betterstack.com/"]);
	});
});

describe("awsCloudwatchAdapter with metrics", () => {
	const adapter = telemetryProviderAdapters.aws_cloudwatch;
	const config = {
		...baseConfig,
		apiKey: "AKIA",
		apiSecret: "secret",
		extraConfig: {
			region: "us-east-1",
			logGroup: "/dokploy/logs",
			metricsNamespace: "Dokploy",
		},
	};

	it("scopes the log fields to logs and the namespace to metrics", () => {
		const bySignal = Object.fromEntries(
			adapter.credentialFields.map((f) => [f.key, f.signal]),
		);
		expect(bySignal).toMatchObject({
			logGroup: "logs",
			logStream: "logs",
			metricsNamespace: "metrics",
		});
		expect(bySignal.region).toBeUndefined();
	});

	it("rejects a namespace starting with AWS/ only when metrics are selected", () => {
		const bad = {
			...config,
			extraConfig: { ...config.extraConfig, metricsNamespace: "AWS/Foo" },
		};
		expect(() => adapter.validateConfig?.(bad)).toThrow(
			/cannot start with AWS\//,
		);
		expect(() =>
			adapter.validateConfig?.({ ...bad, signals: ["logs"] }),
		).not.toThrow();
	});

	it("filters metrics to the allowlist and sets the namespace in the transform", () => {
		const transform = adapter.toVectorTransform?.(
			config,
			"t",
			"scope",
			"metrics",
		);
		expect(transform).toMatchObject({
			type: "remap",
			inputs: ["scope"],
			drop_on_abort: true,
		});
		expect(transform?.source).toContain(
			'if !includes(["cpu_seconds_total","memory_used_bytes","memory_total_bytes","filesystem_used_bytes","filesystem_total_bytes","network_receive_bytes_total","network_transmit_bytes_total","load1","load5","load15","container_cpu_usage_seconds_total","container_memory_usage_bytes","container_network_receive_bytes_total","container_network_transmit_bytes_total"], .name) { abort }',
		);
		expect(transform?.source).toContain('.namespace = "Dokploy"');
		expect(adapter.toVectorSink(config, "s", "t", "metrics")).toMatchObject({
			type: "aws_cloudwatch_metrics",
			inputs: ["t"],
			default_namespace: "Dokploy",
			region: "us-east-1",
			auth: { access_key_id: "AKIA", secret_access_key: "secret" },
		});
	});

	it("tests metrics with PutMetricData only, and translates AccessDenied", async () => {
		aws.putMetricData.mockResolvedValue({});
		await adapter.testConnection?.({ ...config, signals: ["metrics"] });
		expect(aws.putMetricData).toHaveBeenCalledTimes(1);
		expect(aws.describeLogGroups).not.toHaveBeenCalled();
		expect(aws.putMetricData.mock.calls[0]?.[0]).toMatchObject({
			input: { Namespace: "Dokploy" },
		});

		aws.putMetricData.mockRejectedValue(
			Object.assign(new Error("denied"), { name: "AccessDenied" }),
		);
		await expect(
			adapter.testConnection?.({ ...config, signals: ["metrics"] }),
		).rejects.toThrow(/needs cloudwatch:PutMetricData/);
	});

	it("tests logs with DescribeLogGroups only", async () => {
		aws.describeLogGroups.mockResolvedValue({});
		await adapter.testConnection?.({ ...config, signals: ["logs"] });
		expect(aws.describeLogGroups).toHaveBeenCalledTimes(1);
		expect(aws.putMetricData).not.toHaveBeenCalled();
	});
});

describe("splunkAdapter with metrics", () => {
	const adapter = telemetryProviderAdapters.splunk_hec;
	const config = {
		...baseConfig,
		endpoint: "https://splunk.example.com:8088",
		apiKey: "hec",
		extraConfig: { metricsIndex: "dokploy_metrics" },
	};

	it("requires the metrics index only for metrics", () => {
		const field = adapter.credentialFields.find(
			(f) => f.key === "metricsIndex",
		);
		expect(field).toMatchObject({ required: true, signal: "metrics" });
		expect(
			adapter.credentialFields.find((f) => f.key === "index")?.signal,
		).toBe("logs");
	});

	it("builds a splunk_hec_metrics sink", () => {
		expect(adapter.toVectorSink(config, "s", "scope", "metrics")).toMatchObject(
			{
				type: "splunk_hec_metrics",
				endpoint: "https://splunk.example.com:8088",
				default_token: "hec",
				index: "dokploy_metrics",
				source: "dokploy",
				sourcetype: "dokploy:metrics",
			},
		);
	});

	it("writes a test metric and translates HEC code 7", async () => {
		fetchMock.mockResolvedValueOnce(respond(200, { text: "Success", code: 0 }));
		await expect(adapter.testConnection?.(config)).resolves.toBeUndefined();
		expect(calledUrls()).toEqual([
			"https://splunk.example.com:8088/services/collector",
		]);

		fetchMock.mockResolvedValueOnce(
			respond(400, { text: "Incorrect index", code: 7 }),
		);
		await expect(adapter.testConnection?.(config)).rejects.toThrow(
			/can't write to the metrics index "dokploy_metrics"/,
		);
	});

	it("only checks the health endpoint for logs", async () => {
		fetchMock.mockResolvedValueOnce(respond(200));
		await adapter.testConnection?.({ ...config, signals: ["logs"] });
		expect(calledUrls()).toEqual([
			"https://splunk.example.com:8088/services/collector/health",
		]);
	});
});

describe("elasticsearchAdapter with metrics", () => {
	const adapter = telemetryProviderAdapters.elasticsearch;
	const config = { ...baseConfig, endpoint: "https://es.example.com:9200" };

	it("uses the daily default metrics index when none is set, and the custom one otherwise", () => {
		expect(
			adapter.toVectorTransform?.(config, "t", "scope", "metrics"),
		).toBeNull();
		expect(adapter.toVectorSink(config, "s", "scope", "metrics")).toMatchObject(
			{
				type: "elasticsearch",
				api_version: "v8",
				bulk: { index: "dokploy-metrics-%Y.%m.%d" },
			},
		);
		expect(
			adapter.toVectorSink(
				{ ...config, extraConfig: { metricsIndex: "metrics-custom" } },
				"s",
				"scope",
				"metrics",
			).bulk,
		).toEqual({ index: "metrics-custom" });
	});

	it("keeps the logs sink without a bulk index unless one is set", () => {
		expect(adapter.toVectorSink(config, "s", "t", "logs").bulk).toBeUndefined();
	});
});

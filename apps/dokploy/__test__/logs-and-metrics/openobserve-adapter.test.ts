import { telemetryProviderAdapters } from "@dokploy/server/services/logs-and-metrics/providers/registry";
import type { TelemetryProviderRuntimeConfig } from "@dokploy/server/services/logs-and-metrics/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
	lookup: async () => [{ address: "93.184.216.34" }],
}));

const adapter = telemetryProviderAdapters.openobserve;

const config: TelemetryProviderRuntimeConfig = {
	telemetryProviderId: "provider-1",
	name: "test",
	signals: ["logs", "metrics"],
	endpoint: "https://oo.example.com/",
	apiKey: "token",
	apiSecret: null,
	extraConfig: { username: "root@example.com" },
};

const basicAuth = `Basic ${Buffer.from("root@example.com:token").toString("base64")}`;

const originalFetch = global.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
	fetchMock.mockReset();
	global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
	global.fetch = originalFetch;
});

const calls = () =>
	fetchMock.mock.calls.map((call) => ({
		url: String(call[0]),
		init: call[1] as RequestInit,
	}));

describe("openObserveAdapter.toVectorSink", () => {
	it("ships logs through the bulk API of the default organization and stream", () => {
		const sink = adapter.toVectorSink(config, "sink_1", "transform_1", "logs");
		expect(sink).toMatchObject({
			type: "elasticsearch",
			inputs: ["transform_1"],
			endpoints: ["https://oo.example.com/api/default"],
			api_version: "v8",
			bulk: { index: "dokploy" },
			auth: { strategy: "basic", user: "root@example.com", password: "token" },
			healthcheck: { enabled: false },
		});
	});

	it("uses the configured organization and stream", () => {
		const sink = adapter.toVectorSink(
			{
				...config,
				extraConfig: {
					username: "root@example.com",
					organization: "team a",
					stream: "prod_logs",
				},
			},
			"sink_1",
			"transform_1",
			"logs",
		);
		expect(sink.endpoints).toEqual(["https://oo.example.com/api/team%20a"]);
		expect(sink.bulk).toEqual({ index: "prod_logs" });
	});

	it("adds https:// to an endpoint pasted without a scheme", () => {
		const sink = adapter.toVectorSink(
			{ ...config, endpoint: "oo.example.com" },
			"sink_1",
			"transform_1",
			"logs",
		);
		expect(sink.endpoints).toEqual(["https://oo.example.com/api/default"]);
	});

	it("ships metrics through Prometheus remote write", () => {
		const sink = adapter.toVectorSink(config, "sink_2", "scope", "metrics");
		expect(sink).toMatchObject({
			type: "prometheus_remote_write",
			inputs: ["scope"],
			endpoint: "https://oo.example.com/api/default/prometheus/api/v1/write",
			auth: { strategy: "basic", user: "root@example.com", password: "token" },
			healthcheck: { enabled: false },
		});
	});
});

describe("openObserveAdapter.toVectorTransform", () => {
	it("encodes the Docker labels as JSON and keeps the event time, for logs only", () => {
		const transform = adapter.toVectorTransform?.(
			config,
			"transform_1",
			"dokploy_scope",
			"logs",
		);
		expect(transform).toMatchObject({
			type: "remap",
			inputs: ["dokploy_scope"],
		});
		expect(transform?.source).toContain("encode_json(.label)");
		expect(transform?.source).toContain("._timestamp = del(.timestamp)");
		expect(
			adapter.toVectorTransform?.(config, "t", "scope", "metrics"),
		).toBeNull();
	});
});

describe("openObserveAdapter.validateConfig", () => {
	it("rejects a non-http URL and missing credentials", () => {
		expect(() =>
			adapter.validateConfig?.({ ...config, endpoint: "ftp://oo.example.com" }),
		).toThrow(/valid http\(s\) URL/);
		expect(() =>
			adapter.validateConfig?.({ ...config, extraConfig: {} }),
		).toThrow(/email and an ingestion token/);
		expect(() => adapter.validateConfig?.({ ...config, apiKey: null })).toThrow(
			/email and an ingestion token/,
		);
		expect(() => adapter.validateConfig?.(config)).not.toThrow();
	});
});

describe("openObserveAdapter.testConnection", () => {
	it("posts an empty bulk request and an empty remote write with basic auth", async () => {
		fetchMock
			.mockResolvedValueOnce(new Response('{"items":[]}', { status: 200 }))
			.mockResolvedValueOnce(new Response("snappy", { status: 400 }));
		await expect(adapter.testConnection?.(config)).resolves.toBeUndefined();

		const [bulk, remoteWrite] = calls();
		expect(bulk?.url).toBe("https://oo.example.com/api/default/_bulk");
		expect(bulk?.init.method).toBe("POST");
		expect(bulk?.init.body).toBe("");
		expect(bulk?.init.headers).toMatchObject({ Authorization: basicAuth });
		expect(remoteWrite?.url).toBe(
			"https://oo.example.com/api/default/prometheus/api/v1/write",
		);
		expect(remoteWrite?.init.headers).toMatchObject({
			Authorization: basicAuth,
		});
	});

	it("only tests the endpoints of the selected signals", async () => {
		fetchMock.mockResolvedValueOnce(new Response("", { status: 400 }));
		await adapter.testConnection?.({ ...config, signals: ["metrics"] });
		expect(calls().map((call) => call.url)).toEqual([
			"https://oo.example.com/api/default/prometheus/api/v1/write",
		]);
	});

	it("reports rejected credentials and a wrong URL or organization", async () => {
		fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));
		await expect(
			adapter.testConnection?.({ ...config, signals: ["logs"] }),
		).rejects.toThrow(/rejected the credentials \(status 401\)/);

		fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
		await expect(
			adapter.testConnection?.({ ...config, signals: ["logs"] }),
		).rejects.toThrow(/logs endpoint not found \(status 404\)/);

		fetchMock.mockResolvedValueOnce(new Response("", { status: 403 }));
		await expect(
			adapter.testConnection?.({ ...config, signals: ["metrics"] }),
		).rejects.toThrow(/rejected the credentials \(status 403\)/);

		fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
		await expect(
			adapter.testConnection?.({ ...config, signals: ["metrics"] }),
		).rejects.toThrow(/metrics endpoint test failed with status 500/);
	});
});

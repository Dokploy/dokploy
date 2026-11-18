import { providerFetch } from "../provider-fetch";
import type {
	TelemetryProviderAdapter,
	TelemetryProviderRuntimeConfig,
	VectorSinkConfig,
} from "../types";
import {
	DEFAULT_DISK_BUFFER,
	normalizeEndpointUrl,
	stringValue,
} from "../types";

export const influxdbAdapter: TelemetryProviderAdapter = {
	type: "influxdb",
	signals: ["metrics"],
	label: "InfluxDB",
	docsUrl:
		"https://vector.dev/docs/reference/configuration/sinks/influxdb_metrics/",
	credentialFields: [
		{
			key: "endpoint",
			label: "URL",
			type: "url",
			required: true,
			placeholder: "http://influxdb.example.com:8086",
			helpText: "http://host:8086 or your InfluxDB Cloud URL.",
			fullWidth: true,
		},
		{
			key: "org",
			label: "Organization",
			type: "text",
			required: true,
			helpText: "InfluxDB 3 ignores it but the API requires it.",
		},
		{
			key: "bucket",
			label: "Bucket",
			type: "text",
			required: true,
			helpText: "Bucket (2.x) or database (3.x).",
		},
		{
			key: "apiKey",
			label: "API token",
			type: "password",
			required: true,
			helpText:
				"A token with write access to the bucket. Testing the connection writes a real data point.",
			fullWidth: true,
		},
	],
	toVectorSink(
		config: TelemetryProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
	): VectorSinkConfig {
		return {
			type: "influxdb_metrics",
			inputs: [inputId],
			endpoint: normalizeEndpointUrl(config.endpoint ?? ""),
			org: stringValue(config.extraConfig?.org),
			bucket: stringValue(config.extraConfig?.bucket),
			token: config.apiKey ?? "",
			default_namespace: "dokploy",
			version: "2",
			buffer: DEFAULT_DISK_BUFFER,
		};
	},
	async testConnection(config: TelemetryProviderRuntimeConfig): Promise<void> {
		const org = stringValue(config.extraConfig?.org);
		const bucket = stringValue(config.extraConfig?.bucket);
		if (!config.endpoint || !config.apiKey || !org || !bucket) {
			throw new Error(
				"InfluxDB URL, organization, bucket and token are required",
			);
		}
		const base = normalizeEndpointUrl(config.endpoint).replace(/\/$/, "");
		const query = new URLSearchParams({ org, bucket, precision: "s" });
		const response = await providerFetch(`${base}/api/v2/write?${query}`, {
			method: "POST",
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
				Authorization: `Token ${config.apiKey}`,
			},
			body: `dokploy_test,dokploy_test=true value=1 ${Math.floor(Date.now() / 1000)}`,
		});
		if (response.status === 401 || response.status === 403) {
			throw new Error(
				`InfluxDB rejected the token (status ${response.status})`,
			);
		}
		if (response.status === 404) {
			throw new Error("InfluxDB organization or bucket not found (status 404)");
		}
		if (!response.ok) {
			throw new Error(
				`InfluxDB write test failed with status ${response.status}`,
			);
		}
	},
};

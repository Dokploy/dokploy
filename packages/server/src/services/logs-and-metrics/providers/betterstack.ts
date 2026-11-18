import { providerFetch } from "../provider-fetch";
import type {
	TelemetryProviderAdapter,
	TelemetryProviderRuntimeConfig,
	TelemetrySignal,
	VectorSinkConfig,
	VectorTransformConfig,
} from "../types";
import { DEFAULT_DISK_BUFFER, normalizeEndpointUrl } from "../types";

const baseUri = (config: TelemetryProviderRuntimeConfig) =>
	normalizeEndpointUrl(config.endpoint ?? "").replace(/\/$/, "");

export const betterStackAdapter: TelemetryProviderAdapter = {
	type: "betterstack",
	signals: ["logs", "metrics"],
	label: "Better Stack",
	docsUrl: "https://betterstack.com/docs/logs/vector/",
	credentialFields: [
		{
			key: "apiKey",
			label: "Source Token",
			type: "password",
			required: true,
			helpText:
				"Bearer token from your Better Stack source. Testing the connection sends a real test log and/or metric to your account. Not every source accepts metrics; if yours does not, create a second provider for metrics with a source that does.",
			fullWidth: true,
		},
		{
			key: "endpoint",
			label: "Ingesting Host",
			type: "url",
			required: true,
			placeholder: "in.logs.betterstack.com",
			helpText:
				"Shown next to the Source Token when you create the source. Paste it as-is, no https:// needed.",
		},
	],
	toVectorTransform(
		_config: TelemetryProviderRuntimeConfig,
		_transformId: string,
		scopeTransformId: string,
		signal: TelemetrySignal,
	): VectorTransformConfig | null {
		if (signal === "metrics") return null;
		return {
			type: "remap",
			inputs: [scopeTransformId],
			source: ".dt = del(.timestamp)",
		};
	},
	toVectorSink(
		config: TelemetryProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
		signal: TelemetrySignal,
	): VectorSinkConfig {
		return {
			type: "http",
			inputs: [inputId],
			method: "post",
			uri: `${baseUri(config)}/${signal === "metrics" ? "metrics" : ""}`,
			encoding: { codec: "json" },
			compression: "gzip",
			auth: { strategy: "bearer", token: config.apiKey ?? "" },
			buffer: DEFAULT_DISK_BUFFER,
		};
	},
	async testConnection(config: TelemetryProviderRuntimeConfig): Promise<void> {
		if (!config.endpoint || !config.apiKey) {
			throw new Error(
				"Better Stack ingesting host and source token are required",
			);
		}
		const headers = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.apiKey}`,
		};
		if (config.signals.includes("logs")) {
			const response = await providerFetch(`${baseUri(config)}/`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					message: "dokploy-connection-test",
					dokploy_test: true,
				}),
			});
			if (!response.ok) {
				throw new Error(
					`Better Stack test event failed with status ${response.status}`,
				);
			}
		}
		if (config.signals.includes("metrics")) {
			const response = await providerFetch(`${baseUri(config)}/metrics`, {
				method: "POST",
				headers,
				body: JSON.stringify([{ name: "dokploy_test", gauge: { value: 1 } }]),
			});
			if (!response.ok) {
				throw new Error(
					`Better Stack test metric failed with status ${response.status} — this source may not accept metrics`,
				);
			}
		}
	},
};

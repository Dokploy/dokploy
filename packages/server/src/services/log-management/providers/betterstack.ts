import type {
	LogProviderAdapter,
	LogProviderRuntimeConfig,
	VectorSinkConfig,
	VectorTransformConfig,
} from "../types";
import {
	DEFAULT_DISK_BUFFER,
	logProviderFetch,
	normalizeEndpointUrl,
} from "../types";

export const betterStackAdapter: LogProviderAdapter = {
	type: "betterstack",
	label: "Better Stack (Logtail)",
	docsUrl: "https://betterstack.com/docs/logs/vector/",
	credentialFields: [
		{
			key: "apiKey",
			label: "Source Token",
			type: "password",
			required: true,
			helpText:
				"Bearer token from your Better Stack source. Testing the connection sends a real test log to your account.",
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
		_config: LogProviderRuntimeConfig,
		_transformId: string,
		scopeTransformId: string,
	): VectorTransformConfig {
		return {
			type: "remap",
			inputs: [scopeTransformId],
			source: ".dt = del(.timestamp)",
		};
	},
	toVectorSink(
		config: LogProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
	): VectorSinkConfig {
		return {
			type: "http",
			inputs: [inputId],
			method: "post",
			uri: `${normalizeEndpointUrl(config.endpoint ?? "").replace(/\/$/, "")}/`,
			encoding: { codec: "json" },
			compression: "gzip",
			auth: { strategy: "bearer", token: config.apiKey ?? "" },
			buffer: DEFAULT_DISK_BUFFER,
		};
	},
	async testConnection(config: LogProviderRuntimeConfig): Promise<void> {
		if (!config.endpoint || !config.apiKey) {
			throw new Error(
				"Better Stack ingestingHost and sourceToken are required",
			);
		}
		const uri = `${normalizeEndpointUrl(config.endpoint).replace(/\/$/, "")}/`;
		const response = await logProviderFetch(uri, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify({
				message: "dokploy-log-provider-test",
				dokploy_test: true,
			}),
		});
		if (!response.ok) {
			throw new Error(
				`Better Stack test event failed with status ${response.status}`,
			);
		}
	},
};

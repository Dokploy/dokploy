import type {
	LogProviderAdapter,
	LogProviderRuntimeConfig,
	VectorSinkConfig,
} from "../types";
import {
	DEFAULT_DISK_BUFFER,
	logProviderFetch,
	normalizeEndpointUrl,
} from "../types";

export const splunkAdapter: LogProviderAdapter = {
	type: "splunk_hec",
	label: "Splunk HTTP Event Collector",
	docsUrl:
		"https://vector.dev/docs/reference/configuration/sinks/splunk_hec_logs/",
	credentialFields: [
		{
			key: "endpoint",
			label: "Endpoint",
			type: "url",
			required: true,
			placeholder: "https://splunk.example.com:8088",
			helpText: "Base URL of your Splunk instance, including the HEC port.",
		},
		{
			key: "apiKey",
			label: "HEC Token",
			type: "password",
			required: true,
		},
		{
			key: "index",
			label: "Index",
			type: "text",
			required: false,
		},
		{
			key: "sourcetype",
			label: "Source Type",
			type: "text",
			required: false,
			placeholder: "httpevent",
		},
	],
	toVectorSink(
		config: LogProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
	): VectorSinkConfig {
		const index = config.extraConfig?.index;
		const sourcetype = config.extraConfig?.sourcetype;
		return {
			type: "splunk_hec_logs",
			inputs: [inputId],
			endpoint: normalizeEndpointUrl(config.endpoint ?? ""),
			default_token: config.apiKey ?? "",
			encoding: { codec: "json" },
			...(typeof index === "string" && index.length > 0 ? { index } : {}),
			...(typeof sourcetype === "string" && sourcetype.length > 0
				? { sourcetype }
				: {}),
			buffer: DEFAULT_DISK_BUFFER,
		};
	},
	async testConnection(config: LogProviderRuntimeConfig): Promise<void> {
		if (!config.endpoint || !config.apiKey) {
			throw new Error("Splunk endpoint and HEC token are required");
		}
		const response = await logProviderFetch(
			`${normalizeEndpointUrl(config.endpoint).replace(/\/$/, "")}/services/collector/health`,
			{ headers: { Authorization: `Splunk ${config.apiKey}` } },
		);
		if (!response.ok) {
			throw new Error(
				`Splunk HEC health check failed with status ${response.status}`,
			);
		}
	},
};

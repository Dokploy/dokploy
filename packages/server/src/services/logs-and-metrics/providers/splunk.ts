import { providerFetch } from "../provider-fetch";
import type {
	TelemetryProviderAdapter,
	TelemetryProviderRuntimeConfig,
	TelemetrySignal,
	VectorSinkConfig,
} from "../types";
import {
	DEFAULT_DISK_BUFFER,
	normalizeEndpointUrl,
	stringValue,
} from "../types";

const baseUrl = (config: TelemetryProviderRuntimeConfig) =>
	normalizeEndpointUrl(config.endpoint ?? "").replace(/\/$/, "");

export const splunkAdapter: TelemetryProviderAdapter = {
	type: "splunk_hec",
	signals: ["logs", "metrics"],
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
			signal: "logs",
		},
		{
			key: "sourcetype",
			label: "Source Type",
			type: "text",
			required: false,
			signal: "logs",
			placeholder: "httpevent",
		},
		{
			key: "metricsIndex",
			label: "Metrics index",
			type: "text",
			required: true,
			signal: "metrics",
			placeholder: "dokploy_metrics",
			helpText:
				"An index of type Metrics the token can write to (Allowed Indexes). If the token can't, create a second Splunk provider for metrics with another token. Testing the connection writes a real data point.",
			fullWidth: true,
		},
	],
	toVectorSink(
		config: TelemetryProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
		signal: TelemetrySignal,
	): VectorSinkConfig {
		if (signal === "metrics") {
			return {
				type: "splunk_hec_metrics",
				inputs: [inputId],
				endpoint: normalizeEndpointUrl(config.endpoint ?? ""),
				default_token: config.apiKey ?? "",
				index: stringValue(config.extraConfig?.metricsIndex),
				source: "dokploy",
				sourcetype: "dokploy:metrics",
				buffer: DEFAULT_DISK_BUFFER,
			};
		}
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
	async testConnection(config: TelemetryProviderRuntimeConfig): Promise<void> {
		if (!config.endpoint || !config.apiKey) {
			throw new Error("Splunk endpoint and HEC token are required");
		}
		const authorization = { Authorization: `Splunk ${config.apiKey}` };
		if (config.signals.includes("logs")) {
			const response = await providerFetch(
				`${baseUrl(config)}/services/collector/health`,
				{ headers: authorization },
			);
			if (!response.ok) {
				throw new Error(
					`Splunk HEC health check failed with status ${response.status}`,
				);
			}
		}
		if (config.signals.includes("metrics")) {
			const metricsIndex = stringValue(config.extraConfig?.metricsIndex);
			if (!metricsIndex) {
				throw new Error("Splunk metrics index is required");
			}
			const response = await providerFetch(
				`${baseUrl(config)}/services/collector`,
				{
					method: "POST",
					headers: { ...authorization, "Content-Type": "application/json" },
					body: JSON.stringify({
						time: Math.floor(Date.now() / 1000),
						event: "metric",
						source: "dokploy",
						index: metricsIndex,
						fields: { metric_name: "dokploy.test", _value: 1 },
					}),
				},
			);
			if (response.status === 401 || response.status === 403) {
				throw new Error(
					`Splunk rejected the HEC token (status ${response.status})`,
				);
			}
			const body = (await response.json().catch(() => null)) as {
				code?: number;
				text?: string;
			} | null;
			if (body?.code === 7) {
				throw new Error(
					`The HEC token can't write to the metrics index "${metricsIndex}"`,
				);
			}
			if (!response.ok || (body && body.code !== 0)) {
				throw new Error(
					`Splunk metric test failed with status ${response.status}${body?.text ? `: ${body.text}` : ""}`,
				);
			}
		}
	},
};

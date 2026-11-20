import { providerFetch } from "../provider-fetch";
import type {
	TelemetryProviderAdapter,
	TelemetryProviderRuntimeConfig,
	TelemetrySignal,
	VectorSinkConfig,
	VectorTransformConfig,
} from "../types";
import { DEFAULT_DISK_BUFFER } from "../types";

const DDTAGS_VRL = `
tags = []
if .dokploy_project != "" { tags = push(tags, "dokploy_project:" + replace(to_string!(.dokploy_project), ",", "_")) }
if .dokploy_environment != "" { tags = push(tags, "dokploy_environment:" + replace(to_string!(.dokploy_environment), ",", "_")) }
if .dokploy_application != "" { tags = push(tags, "dokploy_application:" + replace(to_string!(.dokploy_application), ",", "_")) }
if .dokploy_organization != "" { tags = push(tags, "dokploy_organization:" + replace(to_string!(.dokploy_organization), ",", "_")) }
if .dokploy_server != "" { tags = push(tags, "dokploy_server:" + replace(to_string!(.dokploy_server), ",", "_")) }
.ddtags = join!(tags, ",")
`.trim();

const resolveSite = (config: TelemetryProviderRuntimeConfig): string => {
	const raw = config.extraConfig?.site;
	if (typeof raw !== "string" || raw.length === 0) return "datadoghq.com";
	return raw
		.trim()
		.replace(/^https?:\/\//, "")
		.replace(/\/+$/, "");
};

export const datadogAdapter: TelemetryProviderAdapter = {
	type: "datadog",
	signals: ["logs", "metrics"],
	label: "Datadog",
	docsUrl: "https://docs.datadoghq.com/logs/",
	credentialFields: [
		{
			key: "apiKey",
			label: "API Key",
			type: "password",
			required: true,
			fullWidth: true,
		},
		{
			key: "site",
			label: "Site",
			type: "text",
			required: false,
			placeholder: "datadoghq.com",
			helpText: "E.g. datadoghq.com (US1) or datadoghq.eu (EU).",
			fullWidth: true,
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
			source: DDTAGS_VRL,
		};
	},
	toVectorSink(
		config: TelemetryProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
		signal: TelemetrySignal,
	): VectorSinkConfig {
		return {
			type: signal === "metrics" ? "datadog_metrics" : "datadog_logs",
			inputs: [inputId],
			default_api_key: config.apiKey ?? "",
			site: resolveSite(config),
			buffer: DEFAULT_DISK_BUFFER,
		};
	},
	async testConnection(config: TelemetryProviderRuntimeConfig): Promise<void> {
		if (!config.apiKey) {
			throw new Error("Datadog API key is required");
		}
		const site = resolveSite(config);
		const response = await providerFetch(
			`https://api.${site}/api/v1/validate`,
			{
				headers: { "DD-API-KEY": config.apiKey },
			},
		);
		if (!response.ok) {
			throw new Error(
				`Datadog API key validation failed with status ${response.status}`,
			);
		}
	},
};

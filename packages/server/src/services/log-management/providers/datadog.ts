import type {
	LogProviderAdapter,
	LogProviderRuntimeConfig,
	VectorSinkConfig,
	VectorTransformConfig,
} from "../types";
import { DEFAULT_DISK_BUFFER, logProviderFetch } from "../types";

const DDTAGS_VRL = `
tags = []
if .dokploy_project != "" { tags = push(tags, "dokploy_project:" + replace(to_string!(.dokploy_project), ",", "_")) }
if .dokploy_environment != "" { tags = push(tags, "dokploy_environment:" + replace(to_string!(.dokploy_environment), ",", "_")) }
if .dokploy_application != "" { tags = push(tags, "dokploy_application:" + replace(to_string!(.dokploy_application), ",", "_")) }
if .dokploy_organization != "" { tags = push(tags, "dokploy_organization:" + replace(to_string!(.dokploy_organization), ",", "_")) }
.ddtags = join!(tags, ",")
`.trim();

const resolveSite = (config: LogProviderRuntimeConfig): string => {
	const raw = config.extraConfig?.site;
	if (typeof raw !== "string" || raw.length === 0) return "datadoghq.com";
	return raw
		.trim()
		.replace(/^https?:\/\//, "")
		.replace(/\/+$/, "");
};

export const datadogAdapter: LogProviderAdapter = {
	type: "datadog",
	label: "Datadog Logs",
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
		_config: LogProviderRuntimeConfig,
		_transformId: string,
		scopeTransformId: string,
	): VectorTransformConfig {
		return {
			type: "remap",
			inputs: [scopeTransformId],
			source: DDTAGS_VRL,
		};
	},
	toVectorSink(
		config: LogProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
	): VectorSinkConfig {
		return {
			type: "datadog_logs",
			inputs: [inputId],
			default_api_key: config.apiKey ?? "",
			site: resolveSite(config),
			buffer: DEFAULT_DISK_BUFFER,
		};
	},
	async testConnection(config: LogProviderRuntimeConfig): Promise<void> {
		if (!config.apiKey) {
			throw new Error("Datadog API key is required");
		}
		const site = resolveSite(config);
		const response = await logProviderFetch(
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

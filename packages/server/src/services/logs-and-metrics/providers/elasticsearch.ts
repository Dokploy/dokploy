import { providerFetch } from "../provider-fetch";
import type {
	TelemetryProviderAdapter,
	TelemetryProviderRuntimeConfig,
	TelemetrySignal,
	VectorSinkConfig,
	VectorTransformConfig,
} from "../types";
import { DEFAULT_DISK_BUFFER, normalizeEndpointUrl } from "../types";

const LABEL_TO_JSON_VRL = `
if exists(.label) { .label = encode_json(.label) }
`.trim();

const DEFAULT_METRICS_INDEX = "dokploy-metrics-%Y.%m.%d";

type AuthMode =
	| { kind: "basic"; username: string; password: string }
	| { kind: "apiKey"; apiKey: string }
	| { kind: "none" };

const resolveAuthMode = (config: TelemetryProviderRuntimeConfig): AuthMode => {
	const username = config.extraConfig?.username;
	const hasUsername = typeof username === "string" && username.length > 0;
	if (hasUsername && !config.apiKey) {
		throw new Error(
			"A Password / API Key is required when Username is set (leave both blank for no auth).",
		);
	}
	if (hasUsername && config.apiKey) {
		return {
			kind: "basic",
			username: username as string,
			password: config.apiKey,
		};
	}
	if (config.apiKey) {
		return { kind: "apiKey", apiKey: config.apiKey };
	}
	return { kind: "none" };
};

const buildAuthAndHeaders = (
	config: TelemetryProviderRuntimeConfig,
): Record<string, unknown> => {
	const mode = resolveAuthMode(config);
	if (mode.kind === "basic") {
		return {
			auth: { strategy: "basic", user: mode.username, password: mode.password },
		};
	}
	if (mode.kind === "apiKey") {
		return {
			request: { headers: { Authorization: `ApiKey ${mode.apiKey}` } },
		};
	}
	return {};
};

export const elasticsearchAdapter: TelemetryProviderAdapter = {
	type: "elasticsearch",
	signals: ["logs", "metrics"],
	label: "Elasticsearch / OpenSearch",
	docsUrl:
		"https://vector.dev/docs/reference/configuration/sinks/elasticsearch/",
	credentialFields: [
		{
			key: "endpoint",
			label: "Endpoint",
			type: "url",
			required: true,
			placeholder: "https://elasticsearch.example.com:9200",
		},
		{
			key: "username",
			label: "Username",
			type: "text",
			required: false,
			helpText: "Leave blank to use an API key instead of basic auth.",
		},
		{
			key: "apiKey",
			label: "Password / API Key",
			type: "password",
			required: false,
			helpText:
				"Password for Username, or an API key alone. Leave both blank for no auth.",
			fullWidth: true,
		},
		{
			key: "index",
			label: "Index",
			type: "text",
			required: false,
			signal: "logs",
			placeholder: "vector-%Y.%m.%d",
			helpText: "Defaults to vector-%Y.%m.%d, a daily index.",
			fullWidth: true,
		},
		{
			key: "metricsIndex",
			label: "Metrics index",
			type: "text",
			required: false,
			signal: "metrics",
			placeholder: DEFAULT_METRICS_INDEX,
			helpText: `Defaults to ${DEFAULT_METRICS_INDEX}, a daily index. Keep it separate from the logs index.`,
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
			source: LABEL_TO_JSON_VRL,
		};
	},
	toVectorSink(
		config: TelemetryProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
		signal: TelemetrySignal,
	): VectorSinkConfig {
		const common = {
			inputs: [inputId],
			endpoints: [normalizeEndpointUrl(config.endpoint ?? "")],
			api_version: "v8",
			...buildAuthAndHeaders(config),
			buffer: DEFAULT_DISK_BUFFER,
		};
		if (signal === "metrics") {
			const metricsIndex = config.extraConfig?.metricsIndex;
			return {
				type: "elasticsearch",
				...common,
				bulk: {
					index:
						typeof metricsIndex === "string" && metricsIndex.length > 0
							? metricsIndex
							: DEFAULT_METRICS_INDEX,
				},
			};
		}
		const index = config.extraConfig?.index;
		return {
			type: "elasticsearch",
			...common,
			...(typeof index === "string" && index.length > 0
				? { bulk: { index } }
				: {}),
		};
	},
	async testConnection(config: TelemetryProviderRuntimeConfig): Promise<void> {
		if (!config.endpoint) {
			throw new Error("Elasticsearch/OpenSearch endpoint is required");
		}
		const mode = resolveAuthMode(config);
		const headers: Record<string, string> = {};
		if (mode.kind === "basic") {
			headers.Authorization = `Basic ${Buffer.from(
				`${mode.username}:${mode.password}`,
			).toString("base64")}`;
		} else if (mode.kind === "apiKey") {
			headers.Authorization = `ApiKey ${mode.apiKey}`;
		}
		const response = await providerFetch(
			`${normalizeEndpointUrl(config.endpoint).replace(/\/$/, "")}/_cluster/health`,
			{ headers },
		);
		if (!response.ok) {
			throw new Error(
				`Elasticsearch/OpenSearch health check failed with status ${response.status}`,
			);
		}
	},
	validateConfig(config: TelemetryProviderRuntimeConfig): void {
		resolveAuthMode(config);
	},
};

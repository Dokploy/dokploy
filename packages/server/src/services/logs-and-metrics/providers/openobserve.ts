import { providerFetch } from "../provider-fetch";
import type {
	TelemetryProviderAdapter,
	TelemetryProviderRuntimeConfig,
	TelemetrySignal,
	VectorSinkConfig,
	VectorTransformConfig,
} from "../types";
import {
	DEFAULT_DISK_BUFFER,
	normalizeEndpointUrl,
	stringValue,
} from "../types";

const DEFAULT_ORGANIZATION = "default";
const DEFAULT_STREAM = "dokploy";

// OpenObserve turns every nested key into its own column, so the Docker labels map would add one column per label.
// Without _timestamp it stamps events with the ingestion time, which drifts when the disk buffer replays a backlog.
const LOGS_REMAP_VRL = `
if exists(.label) { .label = encode_json(.label) }
if exists(.timestamp) { ._timestamp = del(.timestamp) }
`.trim();

const organizationUrl = (config: TelemetryProviderRuntimeConfig) => {
	const base = normalizeEndpointUrl(stringValue(config.endpoint)).replace(
		/\/+$/,
		"",
	);
	const organization =
		stringValue(config.extraConfig?.organization) || DEFAULT_ORGANIZATION;
	return `${base}/api/${encodeURIComponent(organization)}`;
};

const remoteWriteUrl = (config: TelemetryProviderRuntimeConfig) =>
	`${organizationUrl(config)}/prometheus/api/v1/write`;

const credentials = (config: TelemetryProviderRuntimeConfig) => ({
	user: stringValue(config.extraConfig?.username),
	password: config.apiKey ?? "",
});

const basicAuthHeader = (config: TelemetryProviderRuntimeConfig) => {
	const { user, password } = credentials(config);
	return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
};

const throwForStatus = (response: Response, what: string): never => {
	if (response.status === 401 || response.status === 403) {
		throw new Error(
			`OpenObserve rejected the credentials (status ${response.status})`,
		);
	}
	if (response.status === 404) {
		throw new Error(
			`OpenObserve ${what} not found (status 404). Check the URL and the organization`,
		);
	}
	throw new Error(
		`OpenObserve ${what} test failed with status ${response.status}`,
	);
};

export const openObserveAdapter: TelemetryProviderAdapter = {
	type: "openobserve",
	signals: ["logs", "metrics"],
	label: "OpenObserve",
	docsUrl: "https://openobserve.ai/docs/ingestion/logs/vector/",
	credentialFields: [
		{
			key: "endpoint",
			label: "URL",
			type: "url",
			required: true,
			placeholder: "https://openobserve.example.com",
			helpText:
				"Base URL of your OpenObserve instance, without /api. OpenObserve Cloud: https://api.openobserve.ai",
		},
		{
			key: "organization",
			label: "Organization",
			type: "text",
			required: false,
			placeholder: DEFAULT_ORGANIZATION,
			helpText: "The organization identifier. Leave blank for the default one.",
		},
		{
			key: "username",
			label: "Email",
			type: "text",
			required: true,
		},
		{
			key: "apiKey",
			label: "Ingestion token / Password",
			type: "password",
			required: true,
			helpText:
				"The ingestion token from Data > Data sources in OpenObserve, or the user's password.",
		},
		{
			key: "stream",
			label: "Logs stream",
			type: "text",
			required: false,
			signal: "logs",
			placeholder: DEFAULT_STREAM,
			helpText: `Defaults to ${DEFAULT_STREAM}. Metrics get one stream per metric name.`,
			fullWidth: true,
		},
	],
	validateConfig(config: TelemetryProviderRuntimeConfig): void {
		const endpoint = stringValue(config.endpoint);
		const hasOtherScheme =
			/^[a-z][a-z0-9+.-]*:\/\//i.test(endpoint) &&
			!/^https?:\/\//i.test(endpoint);
		if (
			!endpoint ||
			hasOtherScheme ||
			!URL.canParse(normalizeEndpointUrl(endpoint))
		) {
			throw new Error("OpenObserve URL must be a valid http(s) URL");
		}
		const { user, password } = credentials(config);
		if (!user || !password) {
			throw new Error(
				"OpenObserve needs an email and an ingestion token or password",
			);
		}
	},
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
			source: LOGS_REMAP_VRL,
		};
	},
	toVectorSink(
		config: TelemetryProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
		signal: TelemetrySignal,
	): VectorSinkConfig {
		const auth = { strategy: "basic", ...credentials(config) };
		if (signal === "metrics") {
			return {
				type: "prometheus_remote_write",
				inputs: [inputId],
				endpoint: remoteWriteUrl(config),
				auth,
				// The sink healthcheck is an empty POST, which OpenObserve answers with 400.
				healthcheck: { enabled: false },
				buffer: DEFAULT_DISK_BUFFER,
			};
		}
		return {
			type: "elasticsearch",
			inputs: [inputId],
			endpoints: [organizationUrl(config)],
			api_version: "v8",
			bulk: {
				index: stringValue(config.extraConfig?.stream) || DEFAULT_STREAM,
			},
			compression: "gzip",
			auth,
			// OpenObserve implements the bulk API but not /_cluster/health, which the healthcheck calls.
			healthcheck: { enabled: false },
			buffer: DEFAULT_DISK_BUFFER,
		};
	},
	async testConnection(config: TelemetryProviderRuntimeConfig): Promise<void> {
		openObserveAdapter.validateConfig?.(config);
		const authorization = basicAuthHeader(config);
		if (config.signals.includes("logs")) {
			// An empty bulk request checks the URL and the credentials without writing a document.
			const response = await providerFetch(`${organizationUrl(config)}/_bulk`, {
				method: "POST",
				headers: {
					Authorization: authorization,
					"Content-Type": "application/x-ndjson",
				},
				body: "",
			});
			if (!response.ok) throwForStatus(response, "logs endpoint");
		}
		if (config.signals.includes("metrics")) {
			// Remote write needs snappy protobuf, so the empty body gets a 400 once auth and path pass.
			const response = await providerFetch(remoteWriteUrl(config), {
				method: "POST",
				headers: {
					Authorization: authorization,
					"Content-Type": "application/x-protobuf",
					"Content-Encoding": "snappy",
					"X-Prometheus-Remote-Write-Version": "0.1.0",
				},
			});
			if (!response.ok && response.status !== 400) {
				throwForStatus(response, "metrics endpoint");
			}
		}
	},
};

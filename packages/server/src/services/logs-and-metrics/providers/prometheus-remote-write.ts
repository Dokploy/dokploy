import { providerFetch } from "../provider-fetch";
import type {
	TelemetryProviderAdapter,
	TelemetryProviderRuntimeConfig,
	VectorSinkConfig,
} from "../types";
import { DEFAULT_DISK_BUFFER, stringValue } from "../types";

const assertHttpUrl = (endpoint: string | null) => {
	let url: URL;
	try {
		url = new URL(endpoint ?? "");
	} catch {
		throw new Error("Remote write URL must be a valid http(s) URL");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("Remote write URL must be a valid http(s) URL");
	}
	return url;
};

const buildAuth = (config: TelemetryProviderRuntimeConfig) => {
	const username = stringValue(config.extraConfig?.username);
	if (!config.apiKey) return {};
	return username
		? { auth: { strategy: "basic", user: username, password: config.apiKey } }
		: { auth: { strategy: "bearer", token: config.apiKey } };
};

const buildAuthHeader = (
	config: TelemetryProviderRuntimeConfig,
): Record<string, string> => {
	const username = stringValue(config.extraConfig?.username);
	if (!config.apiKey) return {};
	return username
		? {
				Authorization: `Basic ${Buffer.from(`${username}:${config.apiKey}`).toString("base64")}`,
			}
		: { Authorization: `Bearer ${config.apiKey}` };
};

export const prometheusRemoteWriteAdapter: TelemetryProviderAdapter = {
	type: "prometheus_remote_write",
	signals: ["metrics"],
	label: "Prometheus remote write",
	docsUrl:
		"https://vector.dev/docs/reference/configuration/sinks/prometheus_remote_write/",
	credentialFields: [
		{
			key: "endpoint",
			label: "Remote write URL",
			type: "url",
			required: true,
			placeholder: "http://prometheus.example.com:9090/api/v1/write",
			helpText:
				"Prometheus: http://host:9090/api/v1/write (start it with --web.enable-remote-write-receiver). Grafana Cloud: the /api/prom/push URL from the Prometheus card. Mimir: http://host:9009/api/v1/push. VictoriaMetrics: http://host:8428/api/v1/write.",
			fullWidth: true,
		},
		{
			key: "username",
			label: "Username / Instance ID",
			type: "text",
			required: false,
			helpText:
				"Leave blank if the endpoint needs no auth. Grafana Cloud: the Prometheus Instance ID (not the Loki one).",
		},
		{
			key: "apiKey",
			label: "Password / Token",
			type: "password",
			required: false,
			helpText:
				"With a username it is sent as basic auth; alone, as a bearer token. Grafana Cloud: an Access Policy token with metrics:write.",
		},
		{
			key: "tenantId",
			label: "Tenant ID",
			type: "text",
			required: false,
			helpText: "Only for multi-tenant Mimir/Cortex (X-Scope-OrgID header).",
			fullWidth: true,
		},
	],
	validateConfig(config: TelemetryProviderRuntimeConfig): void {
		assertHttpUrl(config.endpoint);
	},
	toVectorSink(
		config: TelemetryProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
	): VectorSinkConfig {
		const tenantId = stringValue(config.extraConfig?.tenantId);
		return {
			type: "prometheus_remote_write",
			inputs: [inputId],
			endpoint: config.endpoint ?? "",
			// The sink healthcheck is an empty POST that Prometheus and Mimir answer with 400.
			healthcheck: { enabled: false },
			...(tenantId ? { tenant_id: tenantId } : {}),
			...buildAuth(config),
			buffer: DEFAULT_DISK_BUFFER,
		};
	},
	async testConnection(config: TelemetryProviderRuntimeConfig): Promise<void> {
		const url = assertHttpUrl(config.endpoint);
		const tenantId = stringValue(config.extraConfig?.tenantId);
		// Remote write needs snappy protobuf, so the empty test body gets a 400 once auth and path pass.
		const response = await providerFetch(url.toString(), {
			method: "POST",
			headers: {
				"Content-Type": "application/x-protobuf",
				"Content-Encoding": "snappy",
				"X-Prometheus-Remote-Write-Version": "0.1.0",
				...buildAuthHeader(config),
				...(tenantId ? { "X-Scope-OrgID": tenantId } : {}),
			},
		});
		if (response.ok || response.status === 400) return;
		if (response.status === 401 || response.status === 403) {
			throw new Error(
				`Remote write endpoint rejected the credentials (status ${response.status})`,
			);
		}
		if (response.status === 404 || response.status === 405) {
			throw new Error(
				`Remote write endpoint not found at this URL (status ${response.status}) — check the path`,
			);
		}
		throw new Error(`Remote write test failed with status ${response.status}`);
	},
};

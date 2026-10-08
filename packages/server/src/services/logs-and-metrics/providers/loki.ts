import { providerFetch } from "../provider-fetch";
import type {
	TelemetryProviderAdapter,
	TelemetryProviderRuntimeConfig,
	VectorSinkConfig,
} from "../types";
import { DEFAULT_DISK_BUFFER, normalizeEndpointUrl } from "../types";

export const lokiAdapter: TelemetryProviderAdapter = {
	type: "loki",
	signals: ["logs"],
	label: "Grafana Loki",
	docsUrl: "https://grafana.com/docs/loki/latest/",
	credentialFields: [
		{
			key: "endpoint",
			label: "Endpoint",
			type: "url",
			required: true,
			placeholder: "https://loki.example.com",
			helpText:
				"Base URL of your Loki instance (push API). Loki only takes logs; for Grafana Cloud metrics, add a Prometheus remote write provider with the Prometheus Instance ID.",
		},
		{
			key: "username",
			label: "User / Instance ID",
			type: "text",
			required: false,
			helpText:
				"Leave blank for an unauthenticated Loki. For Grafana Cloud, this is your numeric Instance ID.",
		},
		{
			key: "apiKey",
			label: "Password / API Token",
			type: "password",
			required: false,
			helpText:
				"Leave blank for an unauthenticated Loki. For Grafana Cloud, use an API token here.",
		},
		{
			key: "tenantId",
			label: "Tenant ID",
			type: "text",
			required: false,
			helpText: "Only if your Loki runs in multi-tenant mode.",
			fullWidth: true,
		},
	],
	toVectorSink(
		config: TelemetryProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
	): VectorSinkConfig {
		const tenantId = config.extraConfig?.tenantId;
		const username = config.extraConfig?.username;
		return {
			type: "loki",
			inputs: [inputId],
			endpoint: normalizeEndpointUrl(config.endpoint ?? ""),
			encoding: { codec: "json" },
			labels: {
				dokploy_project: "{{ dokploy_project }}",
				dokploy_environment: "{{ dokploy_environment }}",
				dokploy_application: "{{ dokploy_application }}",
				dokploy_organization: "{{ dokploy_organization }}",
				dokploy_server: "{{ dokploy_server }}",
			},
			...(typeof tenantId === "string" && tenantId.length > 0
				? { tenant_id: tenantId }
				: {}),
			...(config.apiKey
				? {
						auth: {
							strategy: "basic",
							user: typeof username === "string" ? username : "",
							password: config.apiKey,
						},
					}
				: {}),
			buffer: DEFAULT_DISK_BUFFER,
		};
	},
	async testConnection(config: TelemetryProviderRuntimeConfig): Promise<void> {
		if (!config.endpoint) {
			throw new Error("Loki endpoint is required");
		}
		const username = config.extraConfig?.username;
		const tenantId = config.extraConfig?.tenantId;
		const response = await providerFetch(
			`${normalizeEndpointUrl(config.endpoint).replace(/\/$/, "")}/loki/api/v1/push`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(config.apiKey
						? {
								Authorization: `Basic ${Buffer.from(
									`${typeof username === "string" ? username : ""}:${config.apiKey}`,
								).toString("base64")}`,
							}
						: {}),
					...(typeof tenantId === "string" && tenantId.length > 0
						? { "X-Scope-OrgID": tenantId }
						: {}),
				},
				body: JSON.stringify({
					streams: [
						{
							stream: { dokploy_test: "true" },
							values: [[`${Date.now()}000000`, "dokploy-connection-test"]],
						},
					],
				}),
			},
		);
		if (!response.ok) {
			throw new Error(`Loki push test failed with status ${response.status}`);
		}
	},
};

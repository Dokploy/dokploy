import { providerFetch } from "../provider-fetch";
import type {
	TelemetryProviderAdapter,
	TelemetryProviderRuntimeConfig,
	VectorSinkConfig,
} from "../types";
import { DEFAULT_DISK_BUFFER } from "../types";

const resolveRegion = (config: TelemetryProviderRuntimeConfig): "us" | "eu" => {
	const raw = config.extraConfig?.region;
	const region = typeof raw === "string" ? raw.trim().toLowerCase() : "";
	if (region === "" || region === "us") return "us";
	if (region === "eu") return "eu";
	throw new Error('New Relic region must be "us" or "eu"');
};

export const newRelicAdapter: TelemetryProviderAdapter = {
	type: "new_relic",
	signals: ["metrics"],
	label: "New Relic",
	docsUrl:
		"https://docs.newrelic.com/docs/data-apis/ingest-apis/metric-api/introduction-metric-api/",
	credentialFields: [
		{
			key: "apiKey",
			label: "License key",
			type: "password",
			required: true,
			helpText:
				"An INGEST - LICENSE key. Testing the connection sends a real data point.",
			fullWidth: true,
		},
		{
			key: "accountId",
			label: "Account ID",
			type: "text",
			required: true,
			placeholder: "1234567",
			helpText: "The numeric account ID.",
		},
		{
			key: "region",
			label: "Region",
			type: "text",
			required: false,
			placeholder: "us",
			helpText: "us (default) or eu.",
		},
	],
	validateConfig(config: TelemetryProviderRuntimeConfig): void {
		resolveRegion(config);
	},
	toVectorSink(
		config: TelemetryProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
	): VectorSinkConfig {
		const accountId = config.extraConfig?.accountId;
		return {
			type: "new_relic",
			inputs: [inputId],
			api: "metrics",
			license_key: config.apiKey ?? "",
			account_id: typeof accountId === "string" ? accountId.trim() : "",
			region: resolveRegion(config),
			buffer: DEFAULT_DISK_BUFFER,
		};
	},
	async testConnection(config: TelemetryProviderRuntimeConfig): Promise<void> {
		if (!config.apiKey) {
			throw new Error("New Relic license key is required");
		}
		const host =
			resolveRegion(config) === "eu"
				? "metric-api.eu.newrelic.com"
				: "metric-api.newrelic.com";
		const response = await providerFetch(`https://${host}/metric/v1`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Api-Key": config.apiKey,
			},
			body: JSON.stringify([
				{
					metrics: [
						{
							name: "dokploy.test",
							type: "gauge",
							value: 1,
							timestamp: Math.floor(Date.now() / 1000),
							attributes: { dokploy_test: "true" },
						},
					],
				},
			]),
		});
		if (response.status === 403) {
			throw new Error("New Relic rejected the license key (status 403)");
		}
		if (!response.ok) {
			throw new Error(
				`New Relic metric test failed with status ${response.status}`,
			);
		}
	},
};

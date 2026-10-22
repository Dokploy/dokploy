import type { TelemetryProviderAdapter, TelemetryProviderType } from "../types";
import { awsCloudwatchAdapter } from "./aws-cloudwatch";
import { betterStackAdapter } from "./betterstack";
import { datadogAdapter } from "./datadog";
import { elasticsearchAdapter } from "./elasticsearch";
import { influxdbAdapter } from "./influxdb";
import { lokiAdapter } from "./loki";
import { newRelicAdapter } from "./new-relic";
import { prometheusRemoteWriteAdapter } from "./prometheus-remote-write";
import { splunkAdapter } from "./splunk";

export const telemetryProviderAdapters: Record<
	TelemetryProviderType,
	TelemetryProviderAdapter
> = {
	loki: lokiAdapter,
	prometheus_remote_write: prometheusRemoteWriteAdapter,
	new_relic: newRelicAdapter,
	influxdb: influxdbAdapter,
	datadog: datadogAdapter,
	aws_cloudwatch: awsCloudwatchAdapter,
	splunk_hec: splunkAdapter,
	elasticsearch: elasticsearchAdapter,
	betterstack: betterStackAdapter,
};

export function getTelemetryProviderAdapter(
	type: TelemetryProviderType,
): TelemetryProviderAdapter {
	const adapter = telemetryProviderAdapters[type];
	if (!adapter) {
		throw new Error(
			`No TelemetryProviderAdapter registered for type "${type}"`,
		);
	}
	return adapter;
}

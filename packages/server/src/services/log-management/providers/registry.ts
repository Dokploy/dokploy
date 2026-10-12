import type { LogProviderAdapter, LogProviderType } from "../types";
import { awsCloudwatchAdapter } from "./aws-cloudwatch";
import { betterStackAdapter } from "./betterstack";
import { datadogAdapter } from "./datadog";
import { elasticsearchAdapter } from "./elasticsearch";
import { lokiAdapter } from "./loki";
import { splunkAdapter } from "./splunk";

export const logProviderAdapters: Record<LogProviderType, LogProviderAdapter> =
	{
		loki: lokiAdapter,
		datadog: datadogAdapter,
		betterstack: betterStackAdapter,
		elasticsearch: elasticsearchAdapter,
		splunk_hec: splunkAdapter,
		aws_cloudwatch: awsCloudwatchAdapter,
	};

export function getLogProviderAdapter(
	type: LogProviderType,
): LogProviderAdapter {
	const adapter = logProviderAdapters[type];
	if (!adapter) {
		throw new Error(`No LogProviderAdapter registered for type "${type}"`);
	}
	return adapter;
}

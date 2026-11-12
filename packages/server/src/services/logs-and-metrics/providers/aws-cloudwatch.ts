import {
	CloudWatchClient,
	PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
	CloudWatchLogsClient,
	DescribeLogGroupsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { PROVIDER_REQUEST_TIMEOUT_MS } from "../provider-fetch";
import type {
	TelemetryProviderAdapter,
	TelemetryProviderRuntimeConfig,
	TelemetrySignal,
	VectorSinkConfig,
	VectorTransformConfig,
} from "../types";
import { DEFAULT_DISK_BUFFER, stringValue, vrlString } from "../types";

const DEFAULT_STREAM_TEMPLATE = "{{ container_name }}";

export const CLOUDWATCH_METRICS_ALLOWLIST = [
	"cpu_seconds_total",
	"memory_used_bytes",
	"memory_total_bytes",
	"filesystem_used_bytes",
	"filesystem_total_bytes",
	"network_receive_bytes_total",
	"network_transmit_bytes_total",
	"load1",
	"load5",
	"load15",
	"container_cpu_usage_seconds_total",
	"container_memory_usage_bytes",
	"container_network_receive_bytes_total",
	"container_network_transmit_bytes_total",
];

const resolveMetricsNamespace = (config: TelemetryProviderRuntimeConfig) => {
	const namespace = stringValue(config.extraConfig?.metricsNamespace);
	if (namespace.startsWith("AWS/")) {
		throw new Error("The metrics namespace cannot start with AWS/");
	}
	return namespace;
};

const credentials = (config: TelemetryProviderRuntimeConfig) => ({
	accessKeyId: config.apiKey ?? "",
	secretAccessKey: config.apiSecret ?? "",
});

export const awsCloudwatchAdapter: TelemetryProviderAdapter = {
	type: "aws_cloudwatch",
	signals: ["logs", "metrics"],
	label: "AWS CloudWatch",
	docsUrl:
		"https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html",
	credentialFields: [
		{
			key: "apiKey",
			label: "Access Key ID",
			type: "text",
			required: true,
		},
		{
			key: "apiSecret",
			label: "Secret Access Key",
			type: "password",
			required: true,
		},
		{
			key: "region",
			label: "Region",
			type: "text",
			required: true,
			placeholder: "us-east-1",
		},
		{
			key: "logGroup",
			label: "Log Group Name",
			type: "text",
			required: true,
			signal: "logs",
			placeholder: "/dokploy/logs",
			helpText: "Created automatically on first write if it doesn't exist.",
			fullWidth: true,
		},
		{
			key: "logStream",
			label: "Log Stream Name Template",
			type: "text",
			required: false,
			signal: "logs",
			placeholder: DEFAULT_STREAM_TEMPLATE,
			helpText:
				"Vector event template. Defaults to one stream per container name if left blank.",
			fullWidth: true,
		},
		{
			key: "metricsNamespace",
			label: "Metrics namespace",
			type: "text",
			required: true,
			signal: "metrics",
			placeholder: "Dokploy",
			helpText:
				"E.g. Dokploy. Cannot start with AWS/. The IAM user needs cloudwatch:PutMetricData; testing the connection writes a real data point.",
			fullWidth: true,
		},
	],
	validateConfig(config: TelemetryProviderRuntimeConfig): void {
		if (config.signals.includes("metrics")) {
			resolveMetricsNamespace(config);
		}
	},
	toVectorTransform(
		config: TelemetryProviderRuntimeConfig,
		_transformId: string,
		scopeTransformId: string,
		signal: TelemetrySignal,
	): VectorTransformConfig | null {
		if (signal === "logs") return null;
		return {
			type: "remap",
			inputs: [scopeTransformId],
			drop_on_abort: true,
			source: [
				`if !includes(${JSON.stringify(CLOUDWATCH_METRICS_ALLOWLIST)}, .name) { abort }`,
				`.namespace = ${vrlString(resolveMetricsNamespace(config))}`,
			].join("\n"),
		};
	},
	toVectorSink(
		config: TelemetryProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
		signal: TelemetrySignal,
	): VectorSinkConfig {
		const region = stringValue(config.extraConfig?.region);
		if (signal === "metrics") {
			return {
				type: "aws_cloudwatch_metrics",
				inputs: [inputId],
				default_namespace: resolveMetricsNamespace(config),
				region,
				auth: {
					access_key_id: config.apiKey ?? "",
					secret_access_key: config.apiSecret ?? "",
				},
				buffer: DEFAULT_DISK_BUFFER,
			};
		}
		const logGroup = config.extraConfig?.logGroup;
		const logStream = config.extraConfig?.logStream;
		return {
			type: "aws_cloudwatch_logs",
			inputs: [inputId],
			group_name: typeof logGroup === "string" ? logGroup : "",
			stream_name:
				typeof logStream === "string" && logStream.length > 0
					? logStream
					: DEFAULT_STREAM_TEMPLATE,
			region,
			encoding: { codec: "json" },
			auth: {
				access_key_id: config.apiKey ?? "",
				secret_access_key: config.apiSecret ?? "",
			},
			buffer: DEFAULT_DISK_BUFFER,
		};
	},
	async testConnection(config: TelemetryProviderRuntimeConfig): Promise<void> {
		const region = stringValue(config.extraConfig?.region);
		if (!config.apiKey || !config.apiSecret || !region) {
			throw new Error("AWS access key, secret key and region are required");
		}
		const abortSignal = AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS);
		if (config.signals.includes("logs")) {
			const logGroup = stringValue(config.extraConfig?.logGroup);
			if (!logGroup) {
				throw new Error("AWS log group is required");
			}
			const client = new CloudWatchLogsClient({
				region,
				credentials: credentials(config),
			});
			await client.send(
				new DescribeLogGroupsCommand({
					logGroupNamePrefix: logGroup,
					limit: 1,
				}),
				{ abortSignal },
			);
		}
		if (config.signals.includes("metrics")) {
			const namespace = resolveMetricsNamespace(config);
			if (!namespace) {
				throw new Error("AWS metrics namespace is required");
			}
			const client = new CloudWatchClient({
				region,
				credentials: credentials(config),
			});
			try {
				await client.send(
					new PutMetricDataCommand({
						Namespace: namespace,
						MetricData: [
							{
								MetricName: "dokploy_connection_test",
								Value: 1,
								Dimensions: [{ Name: "dokploy_test", Value: "true" }],
							},
						],
					}),
					{ abortSignal },
				);
			} catch (error) {
				if ((error as { name?: string })?.name === "AccessDenied") {
					throw new Error(
						"The IAM user needs cloudwatch:PutMetricData to ship metrics",
					);
				}
				throw error;
			}
		}
	},
};

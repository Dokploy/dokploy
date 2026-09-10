import {
	CloudWatchLogsClient,
	DescribeLogGroupsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import type {
	LogProviderAdapter,
	LogProviderRuntimeConfig,
	VectorSinkConfig,
} from "../types";
import { DEFAULT_DISK_BUFFER, LOG_PROVIDER_REQUEST_TIMEOUT_MS } from "../types";

const DEFAULT_STREAM_TEMPLATE = "{{ container_name }}";

export const awsCloudwatchAdapter: LogProviderAdapter = {
	type: "aws_cloudwatch",
	label: "AWS CloudWatch Logs",
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
			placeholder: "/dokploy/logs",
			helpText: "Created automatically on first write if it doesn't exist.",
			fullWidth: true,
		},
		{
			key: "logStream",
			label: "Log Stream Name Template",
			type: "text",
			required: false,
			placeholder: DEFAULT_STREAM_TEMPLATE,
			helpText:
				"Vector event template. Defaults to one stream per container name if left blank.",
			fullWidth: true,
		},
	],
	toVectorSink(
		config: LogProviderRuntimeConfig,
		_sinkId: string,
		inputId: string,
	): VectorSinkConfig {
		const logGroup = config.extraConfig?.logGroup;
		const logStream = config.extraConfig?.logStream;
		const region = config.extraConfig?.region;
		return {
			type: "aws_cloudwatch_logs",
			inputs: [inputId],
			group_name: typeof logGroup === "string" ? logGroup : "",
			stream_name:
				typeof logStream === "string" && logStream.length > 0
					? logStream
					: DEFAULT_STREAM_TEMPLATE,
			region: typeof region === "string" ? region : "",
			encoding: { codec: "json" },
			auth: {
				access_key_id: config.apiKey ?? "",
				secret_access_key: config.apiSecret ?? "",
			},
			buffer: DEFAULT_DISK_BUFFER,
		};
	},
	async testConnection(config: LogProviderRuntimeConfig): Promise<void> {
		const region = config.extraConfig?.region;
		const logGroup = config.extraConfig?.logGroup;
		if (
			!config.apiKey ||
			!config.apiSecret ||
			typeof region !== "string" ||
			!region ||
			typeof logGroup !== "string" ||
			!logGroup
		) {
			throw new Error(
				"AWS access key, secret key, region and log group are required",
			);
		}
		const client = new CloudWatchLogsClient({
			region,
			credentials: {
				accessKeyId: config.apiKey,
				secretAccessKey: config.apiSecret,
			},
		});
		await client.send(
			new DescribeLogGroupsCommand({
				logGroupNamePrefix: logGroup,
				limit: 1,
			}),
			{ abortSignal: AbortSignal.timeout(LOG_PROVIDER_REQUEST_TIMEOUT_MS) },
		);
	},
};

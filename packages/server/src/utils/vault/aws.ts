import {
	GetSecretValueCommand,
	ListSecretsCommand,
	SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import type { awsVaultConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import type { VaultClient } from "./types";

type AwsConfig = z.infer<typeof awsVaultConfigSchema>;

const parseRef = (ref: string) => {
	if (ref.startsWith("arn:")) {
		throw new Error(
			`Invalid AWS Secrets Manager reference "${ref}": use the secret name, not the ARN`,
		);
	}
	const separatorIndex = ref.lastIndexOf(":");
	if (separatorIndex === -1) {
		return { secretId: ref, field: null };
	}
	return {
		secretId: ref.slice(0, separatorIndex),
		field: ref.slice(separatorIndex + 1),
	};
};

const createClient = (config: AwsConfig) =>
	new SecretsManagerClient({
		region: config.region,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
		...(config.endpoint && { endpoint: config.endpoint }),
	});

export const awsClient: VaultClient<AwsConfig> = {
	async getSecrets(config, refs) {
		const client = createClient(config);
		const secretIds = [...new Set(refs.map((ref) => parseRef(ref).secretId))];

		const secretStrings = new Map<string, string>();
		await Promise.all(
			secretIds.map(async (secretId) => {
				const response = await client.send(
					new GetSecretValueCommand({ SecretId: secretId }),
				);
				if (response.SecretString === undefined) {
					throw new Error(
						`AWS Secrets Manager: secret "${secretId}" has no string value (binary secrets are not supported)`,
					);
				}
				secretStrings.set(secretId, response.SecretString);
			}),
		);

		const result: Record<string, string> = {};
		for (const ref of refs) {
			const { secretId, field } = parseRef(ref);
			const secretString = secretStrings.get(secretId) as string;
			if (field === null) {
				result[ref] = secretString;
				continue;
			}
			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(secretString);
			} catch {
				throw new Error(
					`AWS Secrets Manager: secret "${secretId}" is not JSON, cannot extract field "${field}"`,
				);
			}
			const value = parsed[field];
			if (value === undefined || value === null) {
				throw new Error(
					`AWS Secrets Manager: field "${field}" not found in secret "${secretId}"`,
				);
			}
			result[ref] = typeof value === "string" ? value : JSON.stringify(value);
		}
		return result;
	},

	async testConnection(config) {
		const client = createClient(config);
		await client.send(new ListSecretsCommand({ MaxResults: 1 }));
	},

	async listSecretNames(config) {
		const client = createClient(config);
		const names: string[] = [];
		let nextToken: string | undefined;
		do {
			const response = await client.send(
				new ListSecretsCommand({ MaxResults: 100, NextToken: nextToken }),
			);
			for (const secret of response.SecretList ?? []) {
				if (secret.Name) {
					names.push(secret.Name);
				}
			}
			nextToken = response.NextToken;
		} while (nextToken && names.length < 500);
		return names;
	},
};

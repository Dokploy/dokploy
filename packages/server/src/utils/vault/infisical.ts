import type { infisicalVaultConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type VaultClient, vaultFetch } from "./types";

type InfisicalConfig = z.infer<typeof infisicalVaultConfigSchema>;

const baseUrl = (config: InfisicalConfig) => config.siteUrl.replace(/\/+$/, "");

const login = async (config: InfisicalConfig) => {
	const response = await vaultFetch(
		`${baseUrl(config)}/api/v1/auth/universal-auth/login`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				clientId: config.clientId,
				clientSecret: config.clientSecret,
			}),
		},
	);

	if (!response.ok) {
		throw new Error(
			`Infisical: authentication failed (status ${response.status})`,
		);
	}

	const body = (await response.json()) as { accessToken?: string };
	if (!body.accessToken) {
		throw new Error("Infisical: no access token returned");
	}
	return body.accessToken;
};

const fetchSecrets = async (config: InfisicalConfig) => {
	const accessToken = await login(config);
	const params = new URLSearchParams({
		workspaceId: config.projectId,
		environment: config.environmentSlug,
		secretPath: config.secretPath,
	});
	const response = await vaultFetch(
		`${baseUrl(config)}/api/v3/secrets/raw?${params.toString()}`,
		{ headers: { Authorization: `Bearer ${accessToken}` } },
	);

	if (!response.ok) {
		throw new Error(
			`Infisical: failed to fetch secrets (status ${response.status})`,
		);
	}

	const body = (await response.json()) as {
		secrets?: { secretKey: string; secretValue: string }[];
	};

	const secrets: Record<string, string> = {};
	for (const secret of body.secrets ?? []) {
		secrets[secret.secretKey] = secret.secretValue;
	}
	return secrets;
};

export const infisicalClient: VaultClient<InfisicalConfig> = {
	async getSecrets(config, refs) {
		const secrets = await fetchSecrets(config);
		const result: Record<string, string> = {};
		for (const ref of refs) {
			if (secrets[ref] === undefined) {
				throw new Error(
					`Infisical: secret "${ref}" not found in environment "${config.environmentSlug}"`,
				);
			}
			result[ref] = secrets[ref];
		}
		return result;
	},

	async testConnection(config) {
		await fetchSecrets(config);
	},

	async listSecretNames(config) {
		const secrets = await fetchSecrets(config);
		return Object.keys(secrets);
	},
};

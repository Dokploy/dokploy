import type { azureVaultConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type VaultClient, vaultFetch } from "./types";

type AzureConfig = z.infer<typeof azureVaultConfigSchema>;

const API_VERSION = "7.4";

const baseUrl = (config: AzureConfig) => config.vaultUri.replace(/\/+$/, "");

const getAccessToken = async (config: AzureConfig) => {
	const body = new URLSearchParams({
		grant_type: "client_credentials",
		client_id: config.clientId,
		client_secret: config.clientSecret,
		scope: "https://vault.azure.net/.default",
	});
	const response = await vaultFetch(
		`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
		{
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString(),
		},
	);

	if (!response.ok) {
		let detail = "";
		try {
			const body = (await response.json()) as { error_description?: string };
			detail = (body.error_description ?? "").split("\n")[0] ?? "";
		} catch {}
		throw new Error(
			`Azure Key Vault: authentication failed (status ${response.status}${detail ? `: ${detail}` : ""})`,
		);
	}

	const data = (await response.json()) as { access_token?: string };
	if (!data.access_token) {
		throw new Error("Azure Key Vault: no access token returned");
	}
	return data.access_token;
};

const readSecret = async (config: AzureConfig, token: string, name: string) => {
	const response = await vaultFetch(
		`${baseUrl(config)}/secrets/${encodeURIComponent(name)}?api-version=${API_VERSION}`,
		{ headers: { Authorization: `Bearer ${token}` } },
	);

	if (response.status === 404) {
		throw new Error(`Azure Key Vault: secret "${name}" not found`);
	}
	if (!response.ok) {
		throw new Error(
			`Azure Key Vault: failed to read secret "${name}" (status ${response.status})`,
		);
	}

	const data = (await response.json()) as { value?: string };
	if (data.value === undefined) {
		throw new Error(`Azure Key Vault: secret "${name}" has no value`);
	}
	return data.value;
};

export const azureClient: VaultClient<AzureConfig> = {
	async getSecrets(config, refs) {
		const token = await getAccessToken(config);
		const result: Record<string, string> = {};
		await Promise.all(
			refs.map(async (ref) => {
				result[ref] = await readSecret(config, token, ref);
			}),
		);
		return result;
	},

	async testConnection(config) {
		const token = await getAccessToken(config);
		const response = await vaultFetch(
			`${baseUrl(config)}/secrets?api-version=${API_VERSION}&maxresults=1`,
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		if (!response.ok) {
			throw new Error(
				`Azure Key Vault: cannot list secrets (status ${response.status})`,
			);
		}
	},

	async listSecretNames(config) {
		const token = await getAccessToken(config);
		const names: string[] = [];
		let url: string | null =
			`${baseUrl(config)}/secrets?api-version=${API_VERSION}&maxresults=25`;

		while (url && names.length < 200) {
			const response = await vaultFetch(url, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!response.ok) {
				break;
			}
			const data = (await response.json()) as {
				value?: { id: string }[];
				nextLink?: string | null;
			};
			for (const item of data.value ?? []) {
				const name = item.id.split("/").pop();
				if (name) {
					names.push(name);
				}
			}
			url = data.nextLink ?? null;
		}
		return names.slice(0, 200);
	},
};

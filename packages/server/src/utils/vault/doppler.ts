import type { dopplerVaultConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type VaultClient, vaultFetch } from "./types";

type DopplerConfig = z.infer<typeof dopplerVaultConfigSchema>;

const downloadUrl = (config: DopplerConfig) => {
	const params = new URLSearchParams({ format: "json" });
	if (config.project) {
		params.set("project", config.project);
	}
	if (config.config) {
		params.set("config", config.config);
	}
	return `https://api.doppler.com/v3/configs/config/secrets/download?${params.toString()}`;
};

const downloadSecrets = async (config: DopplerConfig) => {
	const response = await vaultFetch(downloadUrl(config), {
		headers: {
			Authorization: `Bearer ${config.serviceToken}`,
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		let detail = "";
		try {
			const body = (await response.json()) as { messages?: string[] };
			detail = (body.messages ?? []).join(", ");
		} catch {}
		throw new Error(
			`Doppler: failed to fetch secrets (status ${response.status}${detail ? `: ${detail}` : ""})`,
		);
	}

	return (await response.json()) as Record<string, string>;
};

export const dopplerClient: VaultClient<DopplerConfig> = {
	async getSecrets(config, refs) {
		const secrets = await downloadSecrets(config);
		const result: Record<string, string> = {};
		for (const ref of refs) {
			if (secrets[ref] === undefined) {
				throw new Error(`Doppler: secret "${ref}" not found in this config`);
			}
			result[ref] = secrets[ref];
		}
		return result;
	},

	async testConnection(config) {
		await downloadSecrets(config);
	},

	async listSecretNames(config) {
		const secrets = await downloadSecrets(config);
		return Object.keys(secrets);
	},
};

import { createClient } from "@1password/sdk";
import type { onePasswordVaultConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import type { VaultClient } from "./types";
import { vaultFetchWithTimeout } from "./types";

type OnePasswordConfig = z.infer<typeof onePasswordVaultConfigSchema>;

const fetchVariables = async (config: OnePasswordConfig) => {
	let client: Awaited<ReturnType<typeof createClient>>;
	try {
		client = await vaultFetchWithTimeout(
			createClient({
				auth: config.serviceAccountToken,
				integrationName: "Dokploy",
				integrationVersion: "v1.0.0",
			}),
		);
	} catch (error) {
		throw new Error(
			`1Password: authentication failed (${error instanceof Error ? error.message : String(error)})`,
		);
	}

	let response: Awaited<ReturnType<typeof client.environments.getVariables>>;
	try {
		response = await vaultFetchWithTimeout(
			client.environments.getVariables(config.environmentId),
		);
	} catch (error) {
		throw new Error(
			`1Password: failed to read environment "${config.environmentId}" (${
				error instanceof Error ? error.message : String(error)
			})`,
		);
	}

	const secrets: Record<string, string> = {};
	for (const variable of response.variables) {
		secrets[variable.name] = variable.value;
	}
	return secrets;
};

export const onePasswordClient: VaultClient<OnePasswordConfig> = {
	async getSecrets(config, refs) {
		const secrets = await fetchVariables(config);
		const result: Record<string, string> = {};
		for (const ref of refs) {
			if (secrets[ref] === undefined) {
				throw new Error(
					`1Password: variable "${ref}" not found in environment "${config.environmentId}"`,
				);
			}
			result[ref] = secrets[ref];
		}
		return result;
	},

	async testConnection(config) {
		await fetchVariables(config);
	},

	async listSecretNames(config) {
		const secrets = await fetchVariables(config);
		return Object.keys(secrets);
	},
};

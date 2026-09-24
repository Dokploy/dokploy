import type { onePasswordEnvironmentConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import type { VaultClient } from "./types";

type OnePasswordConfig = z.infer<typeof onePasswordEnvironmentConfigSchema>;

const getVariables = async (config: OnePasswordConfig) => {
	const onePassword = await import("@1password/sdk");
	const client = await onePassword.createClient({
		auth: config.serviceAccountToken,
		integrationName: "Dokploy",
		integrationVersion: "1.0.0",
	});
	const response = await client.environments.getVariables(config.environmentId);
	return response.variables;
};

export const onePasswordClient: VaultClient<OnePasswordConfig> = {
	async getSecrets(config, refs) {
		const variables = await getVariables(config);
		const result: Record<string, string> = {};
		for (const ref of refs) {
			const matches = variables.filter((variable) => variable.name === ref);
			if (matches.length !== 1) {
				throw new Error(
					`1Password: variable "${ref}" was not found or is duplicated in the configured Environment`,
				);
			}
			result[ref] = matches[0]!.value;
		}
		return result;
	},

	async testConnection(config) {
		await getVariables(config);
	},

	async listSecretNames(config) {
		const variables = await getVariables(config);
		return variables.map((variable) => variable.name);
	},
};

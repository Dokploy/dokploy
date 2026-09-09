import type { hashicorpVaultConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type VaultClient, vaultFetch } from "./types";

type HashicorpConfig = z.infer<typeof hashicorpVaultConfigSchema>;

const parseRef = (ref: string) => {
	const separatorIndex = ref.lastIndexOf(":");
	if (separatorIndex <= 0 || separatorIndex === ref.length - 1) {
		throw new Error(
			`Invalid HashiCorp Vault reference "${ref}": expected format <path>:<field> (e.g. myapp/prod:DB_PASSWORD)`,
		);
	}
	return {
		path: ref.slice(0, separatorIndex),
		field: ref.slice(separatorIndex + 1),
	};
};

const buildHeaders = (config: HashicorpConfig) => {
	const headers: Record<string, string> = {
		"X-Vault-Token": config.token,
	};
	if (config.namespace) {
		headers["X-Vault-Namespace"] = config.namespace;
	}
	return headers;
};

const baseUrl = (config: HashicorpConfig) => config.url.replace(/\/+$/, "");

const encodePath = (path: string) =>
	path.split("/").map(encodeURIComponent).join("/");

const readSecret = async (config: HashicorpConfig, path: string) => {
	const url = `${baseUrl(config)}/v1/${encodeURIComponent(config.mount)}/data/${encodePath(path)}`;
	const response = await vaultFetch(url, { headers: buildHeaders(config) });

	if (!response.ok) {
		throw new Error(
			`HashiCorp Vault: failed to read secret at "${path}" (status ${response.status})`,
		);
	}

	const body = (await response.json()) as {
		data?: { data?: Record<string, unknown> };
	};
	return body.data?.data ?? {};
};

export const hashicorpClient: VaultClient<HashicorpConfig> = {
	async getSecrets(config, refs) {
		const byPath = new Map<string, string[]>();
		for (const ref of refs) {
			const { path } = parseRef(ref);
			byPath.set(path, [...(byPath.get(path) ?? []), ref]);
		}

		const result: Record<string, string> = {};
		await Promise.all(
			[...byPath.entries()].map(async ([path, pathRefs]) => {
				const data = await readSecret(config, path);
				for (const ref of pathRefs) {
					const { field } = parseRef(ref);
					const value = data[field];
					if (value === undefined || value === null) {
						throw new Error(
							`HashiCorp Vault: field "${field}" not found in secret "${path}"`,
						);
					}
					result[ref] =
						typeof value === "string" ? value : JSON.stringify(value);
				}
			}),
		);
		return result;
	},

	async testConnection(config) {
		const response = await vaultFetch(
			`${baseUrl(config)}/v1/auth/token/lookup-self`,
			{ headers: buildHeaders(config) },
		);
		if (!response.ok) {
			throw new Error(
				`HashiCorp Vault: token validation failed (status ${response.status})`,
			);
		}
	},

	async listSecretNames(config) {
		const MAX_DEPTH = 4;
		const MAX_ENTRIES = 200;
		const names: string[] = [];

		const listKeys = async (path: string) => {
			const cleanPath = path.replace(/\/+$/, "");
			const suffix = cleanPath ? `/${encodePath(cleanPath)}` : "";
			const response = await vaultFetch(
				`${baseUrl(config)}/v1/${encodeURIComponent(config.mount)}/metadata${suffix}?list=true`,
				{ headers: buildHeaders(config) },
			);
			if (!response.ok) {
				return [];
			}
			const body = (await response.json()) as { data?: { keys?: string[] } };
			return body.data?.keys ?? [];
		};

		const walk = async (path: string, depth: number) => {
			if (depth > MAX_DEPTH || names.length >= MAX_ENTRIES) {
				return;
			}
			for (const key of await listKeys(path)) {
				if (names.length >= MAX_ENTRIES) {
					return;
				}
				const fullPath = `${path}${key}`;
				if (key.endsWith("/")) {
					await walk(fullPath, depth + 1);
					continue;
				}
				const fields = await readSecret(config, fullPath).catch(
					() => ({}) as Record<string, unknown>,
				);
				const fieldNames = Object.keys(fields);
				if (fieldNames.length === 0) {
					names.push(fullPath);
					continue;
				}
				for (const field of fieldNames) {
					names.push(`${fullPath}:${field}`);
				}
			}
		};

		await walk("", 0);
		return names.slice(0, MAX_ENTRIES);
	},
};

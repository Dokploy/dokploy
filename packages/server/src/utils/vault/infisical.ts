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

// A reference may address a folder: `<path>:<KEY>`, mirroring the HashiCorp
// client in this directory. Without a colon the whole ref is the secret name
// and the provider's own `secretPath` is used, which is the previous
// behaviour. Dots cannot serve as the separator here because Infisical allows
// them inside secret names, so `a.b.C` is genuinely ambiguous.
const parseRef = (ref: string) => {
	const separatorIndex = ref.lastIndexOf(":");
	if (separatorIndex === -1) {
		return { path: null, key: ref };
	}
	const path = ref.slice(0, separatorIndex);
	const key = ref.slice(separatorIndex + 1);
	if (!path || !key) {
		throw new Error(
			`Invalid Infisical reference "${ref}": expected format <path>:<KEY> (e.g. external/sentry:SENTRY_DSN)`,
		);
	}
	return { path, key };
};

const resolveSecretPath = (config: InfisicalConfig, refPath: string | null) => {
	if (!refPath) {
		return config.secretPath;
	}
	if (refPath.startsWith("/")) {
		return refPath;
	}
	const base = config.secretPath.replace(/\/+$/, "");
	return `${base}/${refPath}`;
};

// One login serves every path a batch of refs touches.
const readPath = async (
	config: InfisicalConfig,
	accessToken: string,
	secretPath: string,
) => {
	const params = new URLSearchParams({
		workspaceId: config.projectId,
		environment: config.environmentSlug,
		secretPath,
		// Infisical's list endpoint leaves secret references (`${env.folder.KEY}`)
		// unexpanded unless asked, so without this a referencing secret arrives as
		// the literal `${...}` string, lands in the generated .env and the deploy
		// still reports success. Single secrets read via /raw/{name} expand by
		// default, which makes the difference easy to miss in the UI.
		expandSecretReferences: "true",
	});
	const response = await vaultFetch(
		`${baseUrl(config)}/api/v3/secrets/raw?${params.toString()}`,
		{ headers: { Authorization: `Bearer ${accessToken}` } },
	);

	if (!response.ok) {
		throw new Error(
			`Infisical: failed to fetch secrets at "${secretPath}" (status ${response.status})`,
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

const fetchSecrets = async (
	config: InfisicalConfig,
	secretPath = config.secretPath,
) => readPath(config, await login(config), secretPath);

export const infisicalClient: VaultClient<InfisicalConfig> = {
	async getSecrets(config, refs) {
		const byPath = new Map<string, string[]>();
		for (const ref of refs) {
			const { path } = parseRef(ref);
			const secretPath = resolveSecretPath(config, path);
			byPath.set(secretPath, [...(byPath.get(secretPath) ?? []), ref]);
		}

		const accessToken = await login(config);
		const result: Record<string, string> = {};
		await Promise.all(
			[...byPath.entries()].map(async ([secretPath, pathRefs]) => {
				const secrets = await readPath(config, accessToken, secretPath);
				for (const ref of pathRefs) {
					const { path, key } = parseRef(ref);
					if (secrets[key] === undefined) {
						// The path is only worth naming when the ref asked for one;
						// for a bare ref the wording stays as it was, so existing
						// error messages don't change for anyone.
						throw new Error(
							path
								? `Infisical: secret "${key}" not found at "${secretPath}" in environment "${config.environmentSlug}"`
								: `Infisical: secret "${key}" not found in environment "${config.environmentSlug}"`,
						);
					}
					result[ref] = secrets[key];
				}
			}),
		);
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

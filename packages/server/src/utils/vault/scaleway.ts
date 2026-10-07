import type { scalewayVaultConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type VaultClient, vaultFetch } from "./types";

type ScalewayConfig = z.infer<typeof scalewayVaultConfigSchema>;

const REVISION = "latest_enabled";
const PAGE_SIZE = 100;
const MAX_LISTED_SECRETS = 500;

const baseUrl = (config: ScalewayConfig) =>
	`${config.apiUrl.replace(/\/+$/, "")}/secret-manager/v1beta1/regions/${config.region}`;

/**
 * Refs are `[folder/]name[:field]`, mirroring how Scaleway splits a secret into
 * a path (folder) and a name. `field` extracts a key from a JSON payload.
 */
export const parseScalewayRef = (ref: string) => {
	const separatorIndex = ref.lastIndexOf(":");
	const field = separatorIndex === -1 ? null : ref.slice(separatorIndex + 1);
	const fullName = separatorIndex === -1 ? ref : ref.slice(0, separatorIndex);
	const slashIndex = fullName.lastIndexOf("/");
	const name = fullName.slice(slashIndex + 1);
	if (!name) {
		throw new Error(
			`Invalid Scaleway Secret Manager reference "${ref}": expected format <name> or <folder>/<name>[:field]`,
		);
	}
	const path = slashIndex === -1 ? "/" : `/${fullName.slice(0, slashIndex)}`;
	return { path: path.replace(/\/+$/, "") || "/", name, field };
};

const request = async (
	config: ScalewayConfig,
	path: string,
	params: Record<string, string>,
	notFoundMessage?: string,
) => {
	const url = `${baseUrl(config)}${path}?${new URLSearchParams(params).toString()}`;
	const response = await vaultFetch(url, {
		headers: { "X-Auth-Token": config.secretKey, Accept: "application/json" },
	});

	if (response.ok) {
		return response;
	}

	if (response.status === 404 && notFoundMessage) {
		throw new Error(`Scaleway Secret Manager: ${notFoundMessage}`);
	}

	let detail = "";
	try {
		const body = (await response.json()) as {
			message?: string;
			error?: string;
		};
		detail = body.message ?? body.error ?? "";
	} catch {}

	const reason =
		response.status === 401 || response.status === 403
			? "authentication failed"
			: "request failed";
	throw new Error(
		`Scaleway Secret Manager: ${reason} (status ${response.status}${detail ? `: ${detail}` : ""})`,
	);
};

const accessSecret = async (
	config: ScalewayConfig,
	secretPath: string,
	secretName: string,
) => {
	const response = await request(
		config,
		`/secrets-by-path/versions/${REVISION}/access`,
		{
			project_id: config.projectId,
			secret_name: secretName,
			secret_path: secretPath,
		},
		`secret "${secretName}" not found in path "${secretPath}"`,
	);

	const data = (await response.json()) as { data?: string };
	if (data.data === undefined) {
		throw new Error(
			`Scaleway Secret Manager: secret "${secretName}" has no enabled version`,
		);
	}
	return Buffer.from(data.data, "base64").toString("utf-8");
};

export const scalewayClient: VaultClient<ScalewayConfig> = {
	async getSecrets(config, refs) {
		const parsed = refs.map((ref) => ({ ref, ...parseScalewayRef(ref) }));
		const secretKey = (entry: { path: string; name: string }) =>
			`${entry.path}#${entry.name}`;

		const payloads = new Map<string, string>();
		await Promise.all(
			[
				...new Map(parsed.map((entry) => [secretKey(entry), entry])).values(),
			].map(async (entry) => {
				payloads.set(
					secretKey(entry),
					await accessSecret(config, entry.path, entry.name),
				);
			}),
		);

		const result: Record<string, string> = {};
		for (const entry of parsed) {
			const payload = payloads.get(secretKey(entry)) as string;
			const { ref, name, field } = entry;
			if (field === null) {
				result[ref] = payload;
				continue;
			}
			let json: Record<string, unknown>;
			try {
				json = JSON.parse(payload);
			} catch {
				throw new Error(
					`Scaleway Secret Manager: secret "${name}" is not JSON, cannot extract field "${field}"`,
				);
			}
			const value = json[field];
			if (value === undefined || value === null) {
				throw new Error(
					`Scaleway Secret Manager: field "${field}" not found in secret "${name}"`,
				);
			}
			result[ref] = typeof value === "string" ? value : JSON.stringify(value);
		}
		return result;
	},

	async testConnection(config) {
		await request(config, "/secrets", {
			project_id: config.projectId,
			page_size: "1",
		});
	},

	async listSecretNames(config) {
		const names: string[] = [];
		let page = 1;

		while (names.length < MAX_LISTED_SECRETS) {
			const response = await request(config, "/secrets", {
				project_id: config.projectId,
				page: String(page),
				page_size: String(PAGE_SIZE),
			});
			const data = (await response.json()) as {
				secrets?: { name: string; path?: string }[];
			};
			const secrets = data.secrets ?? [];
			for (const secret of secrets) {
				const folder = (secret.path ?? "/").replace(/^\/+|\/+$/g, "");
				names.push(folder ? `${folder}/${secret.name}` : secret.name);
			}
			if (secrets.length < PAGE_SIZE) {
				break;
			}
			page += 1;
		}

		return names.slice(0, MAX_LISTED_SECRETS);
	},
};

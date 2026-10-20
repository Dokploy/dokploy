import {
	createHash,
	createPrivateKey,
	createPublicKey,
	createSign,
	type KeyObject,
} from "node:crypto";
import type { ociVaultConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type VaultClient, vaultFetch } from "./types";

type OciConfig = z.infer<typeof ociVaultConfigSchema>;

type Method = "GET" | "POST";

const PAGE_SIZE = 100;
const MAX_LISTED_SECRETS = 500;
const EMPTY_BODY_SHA256 = createHash("sha256").update("").digest("base64");
const SECRET_NAME_REGEX = /^[A-Za-z0-9._-]+$/;
const LIST_NOT_FOUND =
	'the compartment or vault was not found, or the user is not allowed to list its secrets (requires "inspect secrets"). References can still resolve with only "read secret-bundles"';

const secretsUrl = (config: OciConfig, path: string) =>
	new URL(
		`https://secrets.vaults.${config.region}.oci.oraclecloud.com/20190301${path}`,
	);

const vaultsUrl = (config: OciConfig, path: string) =>
	new URL(
		`https://vaults.${config.region}.oci.oraclecloud.com/20180608${path}`,
	);

/**
 * Refs are `name[:field]`. OCI secret names cannot contain `:`, so everything
 * after the first one is a key to extract from a JSON secret.
 */
const parseRef = (ref: string) => {
	const separatorIndex = ref.indexOf(":");
	const name = separatorIndex === -1 ? ref : ref.slice(0, separatorIndex);
	const field = separatorIndex === -1 ? null : ref.slice(separatorIndex + 1);
	if (!SECRET_NAME_REGEX.test(name) || field === "") {
		throw new Error(
			`Invalid OCI Vault reference "${ref}": expected <secret-name> or <secret-name>:<field>`,
		);
	}
	return { name, field };
};

const fingerprintOf = (key: KeyObject) =>
	createHash("md5")
		.update(createPublicKey(key).export({ type: "spki", format: "der" }))
		.digest("hex")
		.replace(/(..)(?!$)/g, "$1:");

const loadSigningKey = (config: OciConfig) => {
	let key: KeyObject;
	try {
		key = createPrivateKey({
			key: config.privateKey,
			format: "pem",
			passphrase: config.passphrase || undefined,
		});
	} catch (error) {
		throw new Error(
			`OCI Vault: cannot read the API private key, check the key and its passphrase (${error instanceof Error ? error.message : "invalid key"})`,
		);
	}
	if (key.asymmetricKeyType !== "rsa") {
		throw new Error("OCI Vault: the API private key must be an RSA key");
	}
	// A mismatched fingerprint only surfaces as an opaque 401 from OCI.
	const fingerprint = fingerprintOf(key);
	if (fingerprint !== config.fingerprint.toLowerCase()) {
		throw new Error(
			`OCI Vault: the fingerprint does not match the private key (the key's fingerprint is ${fingerprint})`,
		);
	}
	return key;
};

const signedHeaders = (
	config: OciConfig,
	key: KeyObject,
	method: Method,
	url: URL,
) => {
	const headers: Record<string, string> = {
		"x-date": new Date().toUTCString(),
	};
	// fetch derives host and content-length itself and ignores explicit values,
	// so they are signed with what it sends but never set here.
	const signed: [string, string][] = [
		["x-date", headers["x-date"] as string],
		[
			"(request-target)",
			`${method.toLowerCase()} ${url.pathname}${url.search}`,
		],
		["host", url.host],
	];
	if (method === "POST") {
		headers["content-type"] = "application/json";
		headers["x-content-sha256"] = EMPTY_BODY_SHA256;
		signed.push(
			["content-type", "application/json"],
			["content-length", "0"],
			["x-content-sha256", EMPTY_BODY_SHA256],
		);
	}

	const signature = createSign("RSA-SHA256")
		.update(signed.map(([name, value]) => `${name}: ${value}`).join("\n"))
		.sign(key, "base64");
	const keyId = `${config.tenancyId}/${config.userId}/${config.fingerprint.toLowerCase()}`;
	headers.authorization = `Signature version="1",keyId="${keyId}",algorithm="rsa-sha256",headers="${signed.map(([name]) => name).join(" ")}",signature="${signature}"`;
	return headers;
};

const request = async (
	config: OciConfig,
	key: KeyObject,
	method: Method,
	url: URL,
	notFoundMessage: string,
) => {
	const response = await vaultFetch(url.toString(), {
		method,
		headers: {
			...signedHeaders(config, key, method, url),
			Accept: "application/json",
		},
		...(method === "POST" && { body: "" }),
	});

	if (response.ok) {
		return response;
	}

	let detail = "";
	try {
		const body = (await response.json()) as { code?: string; message?: string };
		detail = [body.code, body.message].filter(Boolean).join(": ");
	} catch {}
	const requestId = response.headers.get("opc-request-id");
	const status = `status ${response.status}${detail ? `: ${detail}` : ""}${requestId ? `, opc-request-id ${requestId}` : ""}`;

	if (response.status === 401) {
		throw new Error(
			`OCI Vault: authentication failed (${status}). Check the tenancy, user, fingerprint and private key, and that the server clock is correct`,
		);
	}
	// OCI answers 404 both when a resource is missing and when access is denied.
	if (response.status === 404) {
		throw new Error(`OCI Vault: ${notFoundMessage} (${status})`);
	}
	throw new Error(`OCI Vault: request failed (${status})`);
};

const readSecret = async (config: OciConfig, key: KeyObject, name: string) => {
	const url = secretsUrl(config, "/secretbundles/actions/getByName");
	url.search = new URLSearchParams({
		secretName: name,
		vaultId: config.vaultId,
	}).toString();
	const response = await request(
		config,
		key,
		"POST",
		url,
		`secret "${name}" not found in the vault, or the user is not allowed to read it (requires "read secret-bundles")`,
	);

	const bundle = (await response.json()) as {
		secretBundleContent?: { contentType?: string; content?: string };
	};
	const content = bundle.secretBundleContent;
	if (content?.content === undefined) {
		throw new Error(`OCI Vault: secret "${name}" has no content`);
	}
	if (content.contentType !== "BASE64") {
		throw new Error(
			`OCI Vault: secret "${name}" has unsupported content type "${content.contentType}"`,
		);
	}
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(
			Buffer.from(content.content, "base64"),
		);
	} catch {
		throw new Error(
			`OCI Vault: secret "${name}" is not UTF-8 text (binary secrets are not supported)`,
		);
	}
};

const listUrl = (config: OciConfig, limit: number, page?: string) => {
	const url = vaultsUrl(config, "/secrets");
	url.search = new URLSearchParams({
		compartmentId: config.compartmentId,
		vaultId: config.vaultId,
		lifecycleState: "ACTIVE",
		sortBy: "NAME",
		sortOrder: "ASC",
		limit: String(limit),
		...(page && { page }),
	}).toString();
	return url;
};

export const ociClient: VaultClient<OciConfig> = {
	async getSecrets(config, refs) {
		const parsed = refs.map((ref) => ({ ref, ...parseRef(ref) }));
		const key = loadSigningKey(config);

		const contents = new Map<string, string>();
		await Promise.all(
			[...new Set(parsed.map((entry) => entry.name))].map(async (name) => {
				contents.set(name, await readSecret(config, key, name));
			}),
		);

		const result: Record<string, string> = {};
		for (const { ref, name, field } of parsed) {
			const content = contents.get(name) as string;
			if (field === null) {
				result[ref] = content;
				continue;
			}
			let json: Record<string, unknown>;
			try {
				json = JSON.parse(content);
			} catch {
				throw new Error(
					`OCI Vault: secret "${name}" is not JSON, cannot extract field "${field}"`,
				);
			}
			const value = json[field];
			if (value === undefined || value === null) {
				throw new Error(
					`OCI Vault: field "${field}" not found in secret "${name}"`,
				);
			}
			result[ref] = typeof value === "string" ? value : JSON.stringify(value);
		}
		return result;
	},

	async testConnection(config) {
		const key = loadSigningKey(config);
		await request(config, key, "GET", listUrl(config, 1), LIST_NOT_FOUND);
	},

	async listSecretNames(config) {
		const key = loadSigningKey(config);
		const names: string[] = [];
		let page: string | undefined;
		do {
			const response = await request(
				config,
				key,
				"GET",
				listUrl(config, PAGE_SIZE, page),
				LIST_NOT_FOUND,
			);
			const secrets = (await response.json()) as { secretName?: string }[];
			for (const secret of secrets) {
				if (secret.secretName) {
					names.push(secret.secretName);
				}
			}
			page = response.headers.get("opc-next-page") ?? undefined;
		} while (page && names.length < MAX_LISTED_SECRETS);
		return names.slice(0, MAX_LISTED_SECRETS);
	},
};

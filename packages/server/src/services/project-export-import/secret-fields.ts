import type { ResourceKind } from "./types";
import { SECRET_REDACTED, SECRET_REF_PREFIX } from "./types";

export type SecretFieldEntry = {
	field: string;
	kind: "single" | "envFile";
	when?: (row: Record<string, unknown>) => boolean;
	json?: boolean;
};

const ENV_FILE: SecretFieldEntry = { field: "env", kind: "envFile" };

export const SECRET_FIELDS: Partial<Record<ResourceKind, SecretFieldEntry[]>> =
	{
		mount: [
			{ field: "content", kind: "single", when: (row) => row.type === "file" },
		],
		security: [{ field: "password", kind: "single" }],
		destination: [
			{ field: "accessKey", kind: "single" },
			{ field: "secretAccessKey", kind: "single" },
		],
		registry: [{ field: "password", kind: "single" }],
		sshKey: [{ field: "privateKey", kind: "single" }],
		certificate: [{ field: "privateKey", kind: "single" }],
		vaultProvider: [{ field: "config", kind: "single", json: true }],
		dnsProvider: [{ field: "config", kind: "single", json: true }],
		backup: [{ field: "metadata", kind: "single", json: true }],
		project: [ENV_FILE],
		environment: [ENV_FILE],
		compose: [ENV_FILE],
		postgres: [ENV_FILE, { field: "databasePassword", kind: "single" }],
		mysql: [
			ENV_FILE,
			{ field: "databasePassword", kind: "single" },
			{ field: "databaseRootPassword", kind: "single" },
		],
		mariadb: [
			ENV_FILE,
			{ field: "databasePassword", kind: "single" },
			{ field: "databaseRootPassword", kind: "single" },
		],
		mongo: [ENV_FILE, { field: "databasePassword", kind: "single" }],
		redis: [ENV_FILE, { field: "databasePassword", kind: "single" }],
		libsql: [ENV_FILE, { field: "databasePassword", kind: "single" }],
		application: [
			ENV_FILE,
			{ field: "buildArgs", kind: "envFile" },
			{ field: "buildSecrets", kind: "envFile" },
			{ field: "previewEnv", kind: "envFile" },
			{ field: "previewBuildArgs", kind: "envFile" },
			{ field: "previewBuildSecrets", kind: "envFile" },
			{ field: "password", kind: "single" },
		],
	};

const ALWAYS_NEVER_EXPORT = ["createdAt"];
const SERVER_SCOPED_NEVER_EXPORT = [...ALWAYS_NEVER_EXPORT, "serverId"];

export const NEVER_EXPORT_FIELDS: Partial<Record<ResourceKind, string[]>> = {
	application: [
		...SERVER_SCOPED_NEVER_EXPORT,
		"buildServerId",
		"githubId",
		"gitlabId",
		"giteaId",
		"bitbucketId",
		"refreshToken",
	],
	compose: [
		...SERVER_SCOPED_NEVER_EXPORT,
		"githubId",
		"gitlabId",
		"giteaId",
		"bitbucketId",
		"refreshToken",
	],
	postgres: SERVER_SCOPED_NEVER_EXPORT,
	mysql: SERVER_SCOPED_NEVER_EXPORT,
	mariadb: SERVER_SCOPED_NEVER_EXPORT,
	mongo: SERVER_SCOPED_NEVER_EXPORT,
	redis: SERVER_SCOPED_NEVER_EXPORT,
	libsql: SERVER_SCOPED_NEVER_EXPORT,
	project: ALWAYS_NEVER_EXPORT,
	environment: ALWAYS_NEVER_EXPORT,
	domain: ALWAYS_NEVER_EXPORT,
	mount: ALWAYS_NEVER_EXPORT,
	port: ALWAYS_NEVER_EXPORT,
	redirect: ALWAYS_NEVER_EXPORT,
	security: ALWAYS_NEVER_EXPORT,
	backup: ALWAYS_NEVER_EXPORT,
	volumeBackup: ALWAYS_NEVER_EXPORT,
	schedule: ALWAYS_NEVER_EXPORT,
	destination: ALWAYS_NEVER_EXPORT,
	registry: ALWAYS_NEVER_EXPORT,
	sshKey: ALWAYS_NEVER_EXPORT,
	network: ALWAYS_NEVER_EXPORT,
	certificate: ALWAYS_NEVER_EXPORT,
	vaultProvider: [...ALWAYS_NEVER_EXPORT, "assignments"],
	dnsProvider: ALWAYS_NEVER_EXPORT,
};

export const stripNeverExport = <T extends Record<string, unknown>>(
	kind: ResourceKind,
	row: T,
): T => {
	const fields = NEVER_EXPORT_FIELDS[kind];
	if (!fields || fields.length === 0) {
		return row;
	}
	const result = { ...row };
	for (const field of fields) {
		delete result[field];
	}
	return result;
};

export const resolveSecretRef = (
	value: unknown,
	secretsPlain: Map<string, string>,
): string => {
	if (typeof value !== "string" || value === SECRET_REDACTED) {
		return "";
	}
	if (!value.startsWith(SECRET_REF_PREFIX)) {
		return value;
	}
	return secretsPlain.get(value.slice(SECRET_REF_PREFIX.length)) ?? "";
};

const restoreEnvFile = (
	envFile: unknown,
	secretsPlain: Map<string, string>,
): string => {
	if (typeof envFile !== "string") {
		return "";
	}
	return envFile
		.split(/\r?\n/)
		.map((line) => {
			const eqIndex = line.indexOf("=");
			if (eqIndex === -1) {
				return line;
			}
			const key = line.slice(0, eqIndex);
			const value = line.slice(eqIndex + 1);
			return `${key}=${resolveSecretRef(value, secretsPlain)}`;
		})
		.join("\n");
};

export const restoreSecretFields = (
	kind: ResourceKind,
	row: Record<string, unknown>,
	secretsPlain: Map<string, string>,
): Record<string, unknown> => {
	const entries = SECRET_FIELDS[kind];
	if (!entries) {
		return row;
	}
	const result: Record<string, unknown> = { ...row };
	for (const entry of entries) {
		if (entry.when && !entry.when(row)) {
			continue;
		}
		const value = result[entry.field];
		if (value === undefined) {
			continue;
		}
		if (entry.kind === "envFile") {
			result[entry.field] = restoreEnvFile(value, secretsPlain);
			continue;
		}
		const resolved = resolveSecretRef(value, secretsPlain);
		if (entry.json) {
			try {
				result[entry.field] = resolved ? JSON.parse(resolved) : {};
			} catch {
				result[entry.field] = {};
			}
			continue;
		}
		result[entry.field] = resolved;
	}
	return result;
};

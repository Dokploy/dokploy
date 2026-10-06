import { createHash } from "node:crypto";
import { z } from "zod";

export type StudioDatabaseKind =
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "libsql";

export interface StudioDatabase {
	kind: StudioDatabaseKind;
	id: string;
	name: string;
	appName: string;
	serverId: string | null;
	databaseName: string | null;
	databaseUser: string | null;
	databasePassword: string;
	databaseRootPassword: string | null;
	sqldNode: "primary" | "replica" | null;
	networkIds: string[];
	detachDokployNetwork: boolean;
	hasNetworkSwarm: boolean;
	applicationStatus: "idle" | "running" | "done" | "error";
}

export interface SeedLabels {
	projectName: string;
	environmentName: string;
}

export type SeedEnvironment =
	| "production"
	| "staging"
	| "development"
	| "local"
	| "other";

export interface SeedConnection {
	id: string;
	name: string;
	type: "postgres" | "mysql" | "mongodb" | "redis" | "libsql";
	host: string;
	port: number;
	database?: string;
	user?: string;
	password: string;
	authSource?: string;
	environment: SeedEnvironment;
	group: string;
	roles: ["*"];
}

export interface SeedConfig {
	version: "1";
	defaults: { managed: true; ssl: { mode: "disable" } };
	connections: SeedConnection[];
}

const SEED_NAME_MAX_LENGTH = 128;
const SEED_GROUP_MAX_LENGTH = 64;

const STUDIO_TYPES: Record<StudioDatabaseKind, SeedConnection["type"]> = {
	postgres: "postgres",
	mysql: "mysql",
	mariadb: "mysql",
	mongo: "mongodb",
	redis: "redis",
	libsql: "libsql",
};

const STUDIO_PORTS: Record<StudioDatabaseKind, number> = {
	postgres: 5432,
	mysql: 3306,
	mariadb: 3306,
	mongo: 27017,
	redis: 6379,
	libsql: 8080,
};

const sha256Hex = (value: string) =>
	createHash("sha256").update(value, "utf8").digest("hex");

// Derived from the immutable row id rather than appName: an API-created
// appName can hold dots or underscores and reach 70 characters, which
// Studio's id rule (^[a-z0-9-]+$, at most 64) rejects.
export const seedConnectionId = (
	kind: StudioDatabaseKind,
	rowId: string,
): string => `dokploy-${kind}-${sha256Hex(rowId).slice(0, 12)}`;

export const mapSeedEnvironment = (
	environmentName: string,
): SeedEnvironment => {
	switch (environmentName.trim().toLowerCase()) {
		case "production":
		case "prod":
			return "production";
		case "staging":
		case "stage":
			return "staging";
		case "development":
		case "dev":
			return "development";
		case "local":
			return "local";
		default:
			return "other";
	}
};

// Unless it runs in literal mode, Studio replaces a host, database, user or
// password that is exactly ${NAME} with its own environment variable and one
// that is ${vault:<path>#<key>} with a Vault secret (libredb-studio
// src/lib/seed/credential-resolver.ts, ENV_VAR_PATTERN and VAULT_REF_PATTERN).
// Both patterns start with ${ and end with }, so this broader test, which also
// ignores case and surrounding whitespace, covers every value either resolves.
export const isReferenceLikeValue = (
	value: string | null | undefined,
): boolean => {
	const trimmed = value?.trim() ?? "";
	return trimmed.startsWith("${") && trimmed.endsWith("}");
};

// The password of the user the seed names. With databaseUser "root" Dokploy
// sets only MYSQL_ROOT_PASSWORD (utils/databases/mysql.ts); MariaDB always
// creates the user.
export const effectivePassword = (database: StudioDatabase): string | null =>
	database.kind === "mysql" && database.databaseUser === "root"
		? database.databaseRootPassword
		: database.databasePassword;

// Studio's zod max counts UTF-16 code units. Cutting on code points keeps a
// surrogate pair whole: a pair that would end past the limit is dropped, so the
// result can be one unit shorter than the limit. A grapheme cluster such as a
// ZWJ emoji sequence can still be cut, which changes only how the text looks.
const truncate = (value: string, maxLength: number) => {
	if (value.length <= maxLength) {
		return value;
	}
	let result = "";
	for (const character of value) {
		if (result.length + character.length > maxLength) {
			break;
		}
		result += character;
	}
	return result;
};

const requireField = (
	database: StudioDatabase,
	field: "databaseName" | "databaseUser" | "databaseRootPassword",
): string => {
	const value = database[field];
	if (value === null) {
		throw new Error(
			`${database.kind} database "${database.name}" (${database.id}) has no ${field}`,
		);
	}
	return value;
};

const toSeedConnection = (
	database: StudioDatabase,
	labels: SeedLabels,
): SeedConnection => {
	const { kind } = database;
	const name =
		kind === "libsql" && database.sqldNode === "replica"
			? `${database.name} (replica)`
			: database.name;
	// Null only for a MySQL root user without a root password.
	const password =
		effectivePassword(database) ??
		requireField(database, "databaseRootPassword");
	const hasDatabaseName =
		kind === "postgres" || kind === "mysql" || kind === "mariadb";
	return {
		id: seedConnectionId(kind, database.id),
		name: truncate(name, SEED_NAME_MAX_LENGTH),
		type: STUDIO_TYPES[kind],
		host: database.appName,
		port: STUDIO_PORTS[kind],
		...(hasDatabaseName && {
			database: requireField(database, "databaseName"),
		}),
		...(kind !== "redis" && { user: requireField(database, "databaseUser") }),
		password,
		// Dokploy creates the Mongo user in the admin database
		// (utils/databases/mongo.ts), standalone and replica set alike.
		...(kind === "mongo" && { authSource: "admin" }),
		environment: mapSeedEnvironment(labels.environmentName),
		group: truncate(
			`${labels.projectName} / ${labels.environmentName}`,
			SEED_GROUP_MAX_LENGTH,
		),
		roles: ["*"],
	};
};

const compareCodeUnits = (left: string, right: string) => {
	if (left < right) {
		return -1;
	}
	return left > right ? 1 : 0;
};

export const renderSeedConfig = (
	databases: StudioDatabase[],
	labels: SeedLabels,
): SeedConfig | null => {
	if (databases.length === 0) {
		return null;
	}
	const connections = databases
		.map((database) => toSeedConnection(database, labels))
		.sort(
			(left, right) =>
				compareCodeUnits(left.name.toLowerCase(), right.name.toLowerCase()) ||
				compareCodeUnits(left.id, right.id),
		);
	// managed keeps credentials on the Studio server. ssl mode disable stops
	// Studio from turning TLS on for a host that contains a word such as aws or
	// cloud, which an appName can; Dokploy deploys its databases without TLS.
	return {
		version: "1",
		defaults: { managed: true, ssl: { mode: "disable" } },
		connections,
	};
};

// The same test reachability.ts excludes a database with, so a config rendered
// from covered databases passes and a value that slipped through is refused.
const literal = (schema: z.ZodString) =>
	schema.refine(
		(value) => !isReferenceLikeValue(value),
		"Looks like a ${...} reference, which Studio could resolve from its own environment",
	);

// Mirrors the parts of Studio's SeedConfigSchema (libredb-studio
// src/lib/seed/types.ts) that the renderer emits. Studio rejects the whole file
// when one connection is invalid, so a config that fails here is never written.
// Strict objects also refuse keys the renderer must never emit, such as
// readOnly and connectionString.
const seedConnectionSchema = z.strictObject({
	id: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
	name: z.string().min(1).max(SEED_NAME_MAX_LENGTH),
	type: z.enum(["postgres", "mysql", "mongodb", "redis", "libsql"]),
	host: literal(z.string().min(1)),
	port: z.number().int().min(1).max(65535),
	database: literal(z.string()).optional(),
	user: literal(z.string()).optional(),
	password: literal(z.string()),
	authSource: z.string().optional(),
	environment: z.enum([
		"production",
		"staging",
		"development",
		"local",
		"other",
	]),
	group: z.string().max(SEED_GROUP_MAX_LENGTH),
	roles: z
		.array(z.enum(["*", "admin", "user"]))
		.min(1, "At least one role is required"),
});

const seedConfigSchema = z
	.strictObject({
		version: z.literal("1"),
		defaults: z.strictObject({
			managed: z.literal(true),
			ssl: z.strictObject({
				mode: z.enum([
					"disable",
					"require",
					"verify-system",
					"verify-ca",
					"verify-full",
				]),
			}),
		}),
		connections: z
			.array(seedConnectionSchema)
			.min(1, "At least one connection is required"),
	})
	.superRefine((config, ctx) => {
		const seen = new Set<string>();
		config.connections.forEach((connection, index) => {
			if (seen.has(connection.id)) {
				ctx.addIssue({
					code: "custom",
					message: `Duplicate connection id ${connection.id}`,
					path: ["connections", index, "id"],
				});
			}
			seen.add(connection.id);
		});
	});

export const validateSeedConfig = (config: SeedConfig): void => {
	const result = seedConfigSchema.safeParse(config);
	if (result.success) {
		return;
	}
	const issues = result.error.issues.map((issue) => {
		const path =
			issue.path.length > 0 ? issue.path.map(String).join(".") : "config";
		return `${path}: ${issue.message}`;
	});
	throw new Error(`Invalid LibreDB Studio seed config: ${issues.join("; ")}`);
};

export const serializeSeedConfig = (config: SeedConfig | null): string =>
	config === null ? "" : `${JSON.stringify(config, null, 2)}\n`;

export const hashSeedContent = (content: string): string => sha256Hex(content);

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
	effectivePassword,
	hashSeedContent,
	isReferenceLikeValue,
	mapSeedEnvironment,
	renderSeedConfig,
	type SeedConfig,
	type SeedConnection,
	type SeedLabels,
	type StudioDatabase,
	seedConnectionId,
	serializeSeedConfig,
	validateSeedConfig,
} from "@dokploy/server/utils/libredb-studio/seed";
import { describe, expect, it } from "vitest";

const labels: SeedLabels = {
	projectName: "Demo Shop",
	environmentName: "production",
};

const database = (overrides: Partial<StudioDatabase>): StudioDatabase => ({
	kind: "postgres",
	id: "postgres-row-1",
	name: "Orders DB",
	appName: "demo-shop-orders-db-e6qmrw",
	serverId: null,
	databaseName: "orders",
	databaseUser: "orders",
	databasePassword: "orders-pass",
	databaseRootPassword: null,
	sqldNode: null,
	networkIds: [],
	detachDokployNetwork: false,
	hasNetworkSwarm: false,
	applicationStatus: "done",
	...overrides,
});

const renderOne = (
	overrides: Partial<StudioDatabase>,
	seedLabels: SeedLabels = labels,
): SeedConnection => {
	const config = renderSeedConfig([database(overrides)], seedLabels);
	if (config === null || config.connections[0] === undefined) {
		throw new Error("expected one rendered connection");
	}
	return config.connections[0];
};

const sha256 = (value: string) =>
	createHash("sha256").update(value).digest("hex");

const validConfig = (): SeedConfig => {
	const config = renderSeedConfig(
		[
			database({}),
			database({
				kind: "redis",
				id: "redis-row-1",
				name: "Cache",
				appName: "demo-shop-cache-j1k2l3",
				databaseName: null,
				databaseUser: null,
				databasePassword: "redis-pass",
			}),
		],
		labels,
	);
	if (config === null) {
		throw new Error("expected a config");
	}
	return config;
};

const withConnection = (
	changes: Record<string, unknown>,
	remove: string[] = [],
): SeedConfig => {
	const config = validConfig();
	const connection: Record<string, unknown> = {
		...config.connections[0],
		...changes,
	};
	for (const key of remove) {
		delete connection[key];
	}
	return {
		...config,
		connections: [connection as unknown as SeedConnection],
	};
};

const validationError = (config: SeedConfig): string => {
	try {
		validateSeedConfig(config);
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("expected validateSeedConfig to throw");
};

const REFERENCE_MESSAGE =
	"Looks like a ${...} reference, which Studio could resolve from its own environment";

const RESOLVABLE_FIELDS = ["host", "database", "user", "password"] as const;

const survivesUtf8 = (value: string) =>
	Buffer.from(value, "utf8").toString("utf8") === value;

describe("seedConnectionId", () => {
	it("is dokploy-<kind>- followed by the first 12 hex characters of sha256(rowId)", () => {
		expect(seedConnectionId("postgres", "postgres-row-1")).toBe(
			`dokploy-postgres-${sha256("postgres-row-1").slice(0, 12)}`,
		);
		expect(seedConnectionId("redis", "redis-row-1")).toBe(
			"dokploy-redis-ba2973db12d2",
		);
	});

	it("is stable and differs per kind for the same row id", () => {
		expect(seedConnectionId("mysql", "row")).toBe(
			seedConnectionId("mysql", "row"),
		);
		expect(seedConnectionId("mysql", "row")).not.toBe(
			seedConnectionId("mariadb", "row"),
		);
	});

	it("always satisfies Studio's id rule", () => {
		for (const kind of [
			"postgres",
			"mysql",
			"mariadb",
			"mongo",
			"redis",
			"libsql",
		] as const) {
			const id = seedConnectionId(kind, "Row_ID.with.Dots_and_Underscores");
			expect(id).toMatch(/^[a-z0-9-]+$/);
			expect(id.length).toBeLessThanOrEqual(64);
		}
	});
});

describe("mapSeedEnvironment", () => {
	it.each([
		["production", "production"],
		["prod", "production"],
		["  Production ", "production"],
		["PROD", "production"],
		["staging", "staging"],
		["stage", "staging"],
		["Staging", "staging"],
		["development", "development"],
		["dev", "development"],
		["DEV", "development"],
		["local", "local"],
		[" Local ", "local"],
		["qa", "other"],
		["preview", "other"],
		["prod-eu", "other"],
		["", "other"],
	])("maps %j to %s", (name, expected) => {
		expect(mapSeedEnvironment(name)).toBe(expected);
	});
});

describe("isReferenceLikeValue", () => {
	it.each([
		["${JWT_SECRET}"],
		["${vault:secret/data/studio#jwt}"],
		["${lower_case}"],
		["${ spaced }"],
		["${}"],
		["  ${PADDED}  "],
		["\t${TABBED}\r\n"],
	])("flags %j", (value) => {
		expect(isReferenceLikeValue(value)).toBe(true);
	});

	it.each([
		["a${B}"],
		["${B}x"],
		["${B"],
		["$B}"],
		["{B}"],
		["$${B}"],
		["${vault:secret/data/studio#jwt"],
		["p@ss:w#rd%1"],
		[""],
		["   "],
		[null],
		[undefined],
	])("does not flag %j", (value) => {
		expect(isReferenceLikeValue(value)).toBe(false);
	});
});

describe("effectivePassword", () => {
	it("is the root password for a MySQL database whose user is root", () => {
		expect(
			effectivePassword(
				database({
					kind: "mysql",
					databaseUser: "root",
					databasePassword: "user-pass",
					databaseRootPassword: "root-pass",
				}),
			),
		).toBe("root-pass");
	});

	it("is databasePassword for every other database", () => {
		expect(
			effectivePassword(
				database({
					kind: "mysql",
					databaseUser: "app",
					databasePassword: "user-pass",
					databaseRootPassword: "root-pass",
				}),
			),
		).toBe("user-pass");
		expect(
			effectivePassword(
				database({
					kind: "mariadb",
					databaseUser: "root",
					databasePassword: "maria-pass",
					databaseRootPassword: "maria-root",
				}),
			),
		).toBe("maria-pass");
		expect(effectivePassword(database({ databaseUser: "root" }))).toBe(
			"orders-pass",
		);
	});

	it("is null for a MySQL root user without a root password", () => {
		expect(
			effectivePassword(
				database({
					kind: "mysql",
					databaseUser: "root",
					databaseRootPassword: null,
				}),
			),
		).toBeNull();
	});
});

describe("renderSeedConfig mapping", () => {
	it("returns null when no database is covered", () => {
		expect(renderSeedConfig([], labels)).toBeNull();
	});

	it("emits version 1 as a string with managed and ssl disable defaults", () => {
		const config = validConfig();
		expect(config.version).toBe("1");
		expect(config.defaults).toEqual({
			managed: true,
			ssl: { mode: "disable" },
		});
	});

	it("maps postgres", () => {
		expect(renderOne({})).toEqual({
			id: seedConnectionId("postgres", "postgres-row-1"),
			name: "Orders DB",
			type: "postgres",
			host: "demo-shop-orders-db-e6qmrw",
			port: 5432,
			database: "orders",
			user: "orders",
			password: "orders-pass",
			environment: "production",
			group: "Demo Shop / production",
			roles: ["*"],
		});
	});

	it("maps mysql with an application user to databasePassword", () => {
		const connection = renderOne({
			kind: "mysql",
			id: "mysql-row-1",
			databaseName: "legacy",
			databaseUser: "app",
			databasePassword: "user-pass",
			databaseRootPassword: "root-pass",
		});
		expect(connection).toMatchObject({
			type: "mysql",
			port: 3306,
			database: "legacy",
			user: "app",
			password: "user-pass",
		});
	});

	it("maps mysql with the root user to databaseRootPassword", () => {
		const connection = renderOne({
			kind: "mysql",
			id: "mysql-row-1",
			databaseName: "legacy",
			databaseUser: "root",
			databasePassword: "user-pass",
			databaseRootPassword: "root-pass",
		});
		expect(connection.user).toBe("root");
		expect(connection.password).toBe("root-pass");
	});

	it("maps mariadb to the mysql type and always uses databasePassword", () => {
		const connection = renderOne({
			kind: "mariadb",
			id: "mariadb-row-1",
			databaseName: "shop",
			databaseUser: "root",
			databasePassword: "maria-pass",
			databaseRootPassword: "maria-root",
		});
		expect(connection).toMatchObject({
			type: "mysql",
			port: 3306,
			database: "shop",
			user: "root",
			password: "maria-pass",
		});
	});

	it("maps mongo without a database and with authSource admin", () => {
		const connection = renderOne({
			kind: "mongo",
			id: "mongo-row-1",
			databaseName: null,
			databaseUser: "mongo",
			databasePassword: "mongo-pass",
		});
		expect(connection).toMatchObject({
			type: "mongodb",
			port: 27017,
			user: "mongo",
			password: "mongo-pass",
			authSource: "admin",
		});
		expect(connection).not.toHaveProperty("database");
	});

	it("maps redis with a password only", () => {
		const connection = renderOne({
			kind: "redis",
			id: "redis-row-1",
			databaseName: null,
			databaseUser: null,
			databasePassword: "redis-pass",
		});
		expect(connection).toMatchObject({
			type: "redis",
			port: 6379,
			password: "redis-pass",
		});
		expect(connection).not.toHaveProperty("user");
		expect(connection).not.toHaveProperty("database");
		expect(connection).not.toHaveProperty("authSource");
	});

	it("maps libsql with user and password and no database", () => {
		const connection = renderOne({
			kind: "libsql",
			id: "libsql-row-1",
			name: "Edge libSQL",
			databaseName: null,
			databaseUser: "libsql",
			databasePassword: "libsql-pass",
			sqldNode: "primary",
		});
		expect(connection).toMatchObject({
			name: "Edge libSQL",
			type: "libsql",
			port: 8080,
			user: "libsql",
			password: "libsql-pass",
		});
		expect(connection).not.toHaveProperty("database");
	});

	it("seeds a libsql replica like a primary with (replica) appended to the name", () => {
		const connection = renderOne({
			kind: "libsql",
			id: "libsql-row-2",
			name: "Edge libSQL",
			databaseName: null,
			databaseUser: "libsql",
			databasePassword: "libsql-pass",
			sqldNode: "replica",
		});
		expect(connection.name).toBe("Edge libSQL (replica)");
		expect(connection.host).toBe("demo-shop-orders-db-e6qmrw");
	});

	it("uses appName verbatim as the host and never derives the id from it", () => {
		const appName = `api.created_${"x".repeat(58)}`;
		const connection = renderOne({ appName });
		expect(connection.host).toBe(appName);
		expect(connection.id).toBe(seedConnectionId("postgres", "postgres-row-1"));
	});

	it("emits keys in the contract order and omits absent ones", () => {
		expect(Object.keys(renderOne({}))).toEqual([
			"id",
			"name",
			"type",
			"host",
			"port",
			"database",
			"user",
			"password",
			"environment",
			"group",
			"roles",
		]);
		expect(
			Object.keys(
				renderOne({
					kind: "mongo",
					databaseName: null,
					databaseUser: "mongo",
				}),
			),
		).toEqual([
			"id",
			"name",
			"type",
			"host",
			"port",
			"user",
			"password",
			"authSource",
			"environment",
			"group",
			"roles",
		]);
	});

	it("never emits readOnly or connectionString", () => {
		const config = validConfig();
		for (const connection of config.connections) {
			expect(connection).not.toHaveProperty("readOnly");
			expect(connection).not.toHaveProperty("connectionString");
		}
	});

	it("emits integer ports and roles [*]", () => {
		for (const connection of validConfig().connections) {
			expect(Number.isInteger(connection.port)).toBe(true);
			expect(connection.roles).toEqual(["*"]);
		}
	});

	it("maps the environment name", () => {
		expect(
			renderOne({}, { projectName: "Demo Shop", environmentName: "Stage" })
				.environment,
		).toBe("staging");
		expect(
			renderOne({}, { projectName: "Demo Shop", environmentName: "QA" })
				.environment,
		).toBe("other");
	});

	it.each<[string, Partial<StudioDatabase>, string]>([
		["an ASCII name", { name: "n".repeat(200) }, "n".repeat(128)],
		[
			"a name whose limit falls inside a surrogate pair",
			{ name: `${"a".repeat(127)}\u{1F600}` },
			"a".repeat(127),
		],
		[
			"a name whose surrogate pair ends exactly at the limit",
			{ name: `${"a".repeat(126)}\u{1F600}x` },
			`${"a".repeat(126)}\u{1F600}`,
		],
		[
			"a name of astral characters only",
			{ name: "\u{1F600}".repeat(65) },
			"\u{1F600}".repeat(64),
		],
		[
			"a name of non-ASCII characters",
			{ name: "ç".repeat(129) },
			"ç".repeat(128),
		],
		[
			"a libsql replica name after the suffix is appended",
			{
				kind: "libsql",
				name: "l".repeat(120),
				databaseName: null,
				databaseUser: "libsql",
				sqldNode: "replica",
			},
			`${"l".repeat(120)} (replic`,
		],
	])("truncates %s to a name Studio accepts", (_label, overrides, expected) => {
		const config = renderSeedConfig([database(overrides)], labels);
		if (config === null || config.connections[0] === undefined) {
			throw new Error("expected one rendered connection");
		}
		const { name } = config.connections[0];
		expect(name).toBe(expected);
		expect(name.length).toBeLessThanOrEqual(128);
		expect(survivesUtf8(name)).toBe(true);
		expect(() => validateSeedConfig(config)).not.toThrow();
	});

	it.each<[string, SeedLabels, string]>([
		[
			"an ASCII project name",
			{ projectName: "p".repeat(70), environmentName: "production" },
			"p".repeat(64),
		],
		[
			"a project name whose limit falls inside a surrogate pair",
			{
				projectName: `a${"\u{1F600}".repeat(40)}`,
				environmentName: "production",
			},
			`a${"\u{1F600}".repeat(31)}`,
		],
		[
			"a long environment name",
			{ projectName: "Demo Shop", environmentName: "e".repeat(80) },
			`Demo Shop / ${"e".repeat(52)}`,
		],
	])(
		"truncates the group of %s to a group Studio accepts",
		(_label, seedLabels, expected) => {
			const config = renderSeedConfig([database({})], seedLabels);
			if (config === null || config.connections[0] === undefined) {
				throw new Error("expected one rendered connection");
			}
			const { group } = config.connections[0];
			expect(group).toBe(expected);
			expect(group.length).toBeLessThanOrEqual(64);
			expect(survivesUtf8(group)).toBe(true);
			expect(() => validateSeedConfig(config)).not.toThrow();
		},
	);

	it("keeps quotes, backslashes, line breaks and non-ASCII text exactly", () => {
		const databases = [
			database({
				id: "row-quotes",
				name: 'Orders "EU" \\ archive',
				databaseName: "naïve_日本語",
				databaseUser: 'app"user\\',
				// Postgres cannot store a lone surrogate; it is here to show that
				// JSON.stringify escapes one, so the file is still valid UTF-8.
				databasePassword: 'q"u\\o\nt\r\ne\td\u2028\u2029çş\u{1F600}\ud800',
			}),
			database({
				kind: "redis",
				id: "row-redis",
				name: "Cache\nwith a line break",
				databaseName: null,
				databaseUser: null,
				databasePassword: 'pre${JWT_SECRET}post "x" \\ \r\n',
			}),
			database({
				kind: "mongo",
				id: "row-mongo",
				name: "Kullanıcı verileri \u{1F600}",
				databaseName: null,
				databaseUser: "kullanıcı",
				databasePassword: 'şifre"\\',
			}),
		];
		const config = renderSeedConfig(databases, labels);
		if (config === null) {
			throw new Error("expected a config");
		}
		expect(() => validateSeedConfig(config)).not.toThrow();
		const text = serializeSeedConfig(config);
		expect(survivesUtf8(text)).toBe(true);
		expect(JSON.parse(text)).toEqual(config);
		for (const source of databases) {
			const connection = config.connections.find(
				(candidate) =>
					candidate.id === seedConnectionId(source.kind, source.id),
			);
			expect(connection?.name).toBe(source.name);
			expect(connection?.database).toBe(source.databaseName ?? undefined);
			expect(connection?.user).toBe(source.databaseUser ?? undefined);
			expect(connection?.password).toBe(source.databasePassword);
		}
	});

	it("orders connections by lowercased name in code-unit order, then by id", () => {
		const config = renderSeedConfig(
			[
				database({ id: "row-b", name: "beta" }),
				database({ id: "row-a", name: "Alpha" }),
				database({ id: "row-c", name: "alpha" }),
				database({ id: "row-u", name: "\u00c4pfel" }),
				database({ id: "row-z", name: "Zulu" }),
			],
			labels,
		);
		const alphaIds = [
			seedConnectionId("postgres", "row-a"),
			seedConnectionId("postgres", "row-c"),
		].sort();
		expect(config?.connections.map((connection) => connection.id)).toEqual([
			...alphaIds,
			seedConnectionId("postgres", "row-b"),
			seedConnectionId("postgres", "row-z"),
			seedConnectionId("postgres", "row-u"),
		]);
	});

	it("refuses a row that lacks a field its kind needs", () => {
		expect(() => renderOne({ databaseName: null })).toThrow(
			'postgres database "Orders DB" (postgres-row-1) has no databaseName',
		);
		expect(() => renderOne({ kind: "mongo", databaseUser: null })).toThrow(
			'mongo database "Orders DB" (postgres-row-1) has no databaseUser',
		);
		expect(() =>
			renderOne({
				kind: "mysql",
				databaseUser: "root",
				databaseRootPassword: null,
			}),
		).toThrow(
			'mysql database "Orders DB" (postgres-row-1) has no databaseRootPassword',
		);
	});
});

describe("validateSeedConfig", () => {
	it("accepts a rendered config", () => {
		expect(() => validateSeedConfig(validConfig())).not.toThrow();
	});

	it.each<[string, SeedConfig, RegExp]>([
		[
			"a numeric version",
			{ ...validConfig(), version: 1 } as unknown as SeedConfig,
			/version: /,
		],
		[
			"an empty connections list",
			{ ...validConfig(), connections: [] },
			/connections: At least one connection is required/,
		],
		[
			"managed false",
			{
				...validConfig(),
				defaults: { managed: false, ssl: { mode: "disable" } },
			} as unknown as SeedConfig,
			/defaults\.managed: /,
		],
		[
			"an unknown ssl mode",
			{
				...validConfig(),
				defaults: { managed: true, ssl: { mode: "prefer" } },
			} as unknown as SeedConfig,
			/defaults\.ssl\.mode: /,
		],
		[
			"an id with invalid characters",
			withConnection({ id: "Dokploy_Postgres" }),
			/connections\.0\.id: ID must be lowercase alphanumeric with hyphens/,
		],
		[
			"an id longer than 64 characters",
			withConnection({ id: "a".repeat(65) }),
			/connections\.0\.id: /,
		],
		["an empty name", withConnection({ name: "" }), /connections\.0\.name: /],
		[
			"a name longer than 128 characters",
			withConnection({ name: "n".repeat(129) }),
			/connections\.0\.name: /,
		],
		[
			"a type outside the subset",
			withConnection({ type: "mariadb" }),
			/connections\.0\.type: /,
		],
		[
			"a non-integer port",
			withConnection({ port: 5432.5 }),
			/connections\.0\.port: /,
		],
		["port 0", withConnection({ port: 0 }), /connections\.0\.port: /],
		["port 65536", withConnection({ port: 65536 }), /connections\.0\.port: /],
		[
			"a port given as a string",
			withConnection({ port: "5432" }),
			/connections\.0\.port: /,
		],
		[
			"empty roles",
			withConnection({ roles: [] }),
			/connections\.0\.roles: At least one role is required/,
		],
		[
			"an unknown role",
			withConnection({ roles: ["owner"] }),
			/connections\.0\.roles\.0: /,
		],
		[
			"an environment outside the enum",
			withConnection({ environment: "prod" }),
			/connections\.0\.environment: /,
		],
		[
			"a group longer than 64 characters",
			withConnection({ group: "g".repeat(65) }),
			/connections\.0\.group: /,
		],
		[
			"a readOnly key",
			withConnection({ readOnly: true }),
			/connections\.0: .*readOnly/,
		],
		[
			"a connectionString key",
			withConnection({ connectionString: "postgres://u:p@h/db" }),
			/connections\.0: .*connectionString/,
		],
		["an empty host", withConnection({ host: "" }), /connections\.0\.host: /],
		[
			"a missing password",
			withConnection({}, ["password"]),
			/connections\.0\.password: /,
		],
	])("refuses %s", (_label, config, message) => {
		expect(() => validateSeedConfig(config)).toThrow(message);
	});

	it.each([
		["${DATABASE_PASSWORD}"],
		["${vault:secret/data/studio#jwt}"],
		["${lower_case}"],
		["  ${PADDED}\n"],
	])(
		"refuses %j in host, database, user and password, as isReferenceLikeValue does",
		(value) => {
			expect(isReferenceLikeValue(value)).toBe(true);
			for (const field of RESOLVABLE_FIELDS) {
				expect(validationError(withConnection({ [field]: value }))).toBe(
					`Invalid LibreDB Studio seed config: connections.0.${field}: ${REFERENCE_MESSAGE}`,
				);
			}
		},
	);

	it.each([["a${B}"], ["${B}x"], ["${B"], ["${vault:secret/data/studio#jwt"]])(
		"accepts %j in host, database, user and password, as isReferenceLikeValue does",
		(value) => {
			expect(isReferenceLikeValue(value)).toBe(false);
			for (const field of RESOLVABLE_FIELDS) {
				expect(() =>
					validateSeedConfig(withConnection({ [field]: value })),
				).not.toThrow();
			}
		},
	);

	it("refuses duplicate ids", () => {
		const config = validConfig();
		const [first] = config.connections;
		if (first === undefined) {
			throw new Error("expected a connection");
		}
		expect(() =>
			validateSeedConfig({
				...config,
				connections: [first, { ...first, name: "Copy" }],
			}),
		).toThrow(`connections.1.id: Duplicate connection id ${first.id}`);
	});

	it("names every issue in one error", () => {
		const message = validationError(
			withConnection({ id: "BAD", port: 0, group: "g".repeat(65) }),
		);
		expect(message).toMatch(/^Invalid LibreDB Studio seed config: /);
		expect(message).toContain("connections.0.id: ");
		expect(message).toContain("connections.0.port: ");
		expect(message).toContain("connections.0.group: ");
	});

	it("never puts a credential into the error", () => {
		const message = validationError(
			withConnection({ id: "BAD", password: "${HUNTER2_SECRET}" }),
		);
		expect(message).toContain("connections.0.id: ");
		expect(message).toContain("connections.0.password: ");
		expect(message).not.toContain("HUNTER2_SECRET");
	});
});

describe("serializeSeedConfig and hashSeedContent", () => {
	it("serializes with two-space indentation and one trailing newline", () => {
		const config = validConfig();
		const text = serializeSeedConfig(config);
		expect(text).toBe(`${JSON.stringify(config, null, 2)}\n`);
		expect(text.endsWith("}\n")).toBe(true);
		expect(text.endsWith("\n\n")).toBe(false);
	});

	it("serializes no config as an empty string", () => {
		expect(serializeSeedConfig(null)).toBe("");
	});

	it("hashes content with sha256 hex", () => {
		const text = serializeSeedConfig(validConfig());
		expect(hashSeedContent(text)).toBe(sha256(text));
		expect(hashSeedContent("")).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
	});
});

// The same bytes are committed to LibreDB Studio as
// tests/fixtures/dokploy-golden-seed.json, whose test parses them with Studio's
// SeedConfigSchema. Change both copies together.
describe("golden seed fixture", () => {
	const goldenSha256 =
		"f50ecd19298a8abc460801d70b4efbbdfda9633ae84da650780b7ce14a759c31";
	const golden = readFileSync(
		path.join(__dirname, "fixtures", "golden-seed.json"),
		"utf8",
	);
	const goldenDatabases: StudioDatabase[] = [
		database({
			kind: "postgres",
			id: "postgres-row-1",
			name: "Orders DB",
			appName: "demo-shop-orders-db-e6qmrw",
			databaseName: "orders",
			databaseUser: "orders",
			databasePassword: "p@ss:w#rd%1",
			databaseRootPassword: null,
			sqldNode: null,
		}),
		database({
			kind: "mysql",
			id: "mysql-row-1",
			name: "Legacy MySQL",
			appName: "demo-shop-legacy-mysql-a1b2c3",
			databaseName: "legacy",
			databaseUser: "root",
			databasePassword: "user-pass",
			databaseRootPassword: "root-pass",
			sqldNode: null,
		}),
		database({
			kind: "mariadb",
			id: "mariadb-row-1",
			name: "Shop MariaDB",
			appName: "demo-shop-shop-mariadb-d4e5f6",
			databaseName: "shop",
			databaseUser: "shop",
			databasePassword: "maria-pass",
			databaseRootPassword: "maria-root",
			sqldNode: null,
		}),
		database({
			kind: "mongo",
			id: "mongo-row-1",
			name: "Events Mongo",
			appName: "demo-shop-events-mongo-g7h8i9",
			databaseName: null,
			databaseUser: "mongo",
			databasePassword: "mongo-pass",
			databaseRootPassword: null,
			sqldNode: null,
		}),
		database({
			kind: "redis",
			id: "redis-row-1",
			name: "Cache",
			appName: "demo-shop-cache-j1k2l3",
			databaseName: null,
			databaseUser: null,
			databasePassword: "redis-pass",
			databaseRootPassword: null,
			sqldNode: null,
		}),
		database({
			kind: "libsql",
			id: "libsql-row-1",
			name: "Edge libSQL",
			appName: "demo-shop-edge-libsql-m4n5o6",
			databaseName: null,
			databaseUser: "libsql",
			databasePassword: "libsql-pass",
			databaseRootPassword: null,
			sqldNode: "primary",
		}),
	];

	it("is the committed fixture, byte for byte", () => {
		expect(sha256(golden)).toBe(goldenSha256);
	});

	it("renders the six contract inputs to exactly the fixture", () => {
		const config = renderSeedConfig(goldenDatabases, labels);
		expect(config).not.toBeNull();
		if (config === null) {
			return;
		}
		expect(() => validateSeedConfig(config)).not.toThrow();
		const text = serializeSeedConfig(config);
		expect(text).toBe(golden);
		expect(hashSeedContent(text)).toBe(goldenSha256);
	});

	it("does not depend on the input order", () => {
		const reversed = renderSeedConfig([...goldenDatabases].reverse(), labels);
		expect(serializeSeedConfig(reversed)).toBe(golden);
	});
});

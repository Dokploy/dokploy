import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExportScope,
	TransferDb,
} from "@dokploy/server/services/project-export-import";
import {
	buildComposeDumpCommand,
	buildDumpCommand,
	createDumps,
	MAX_EMBEDDED_DUMP_BYTES,
} from "@dokploy/server/services/project-export-import";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const local = (path: string) => ({ serverId: null, path });

describe("buildDumpCommand", () => {
	it("builds a postgres dump command using databaseName/databaseUser", () => {
		const built = buildDumpCommand("postgres", {
			appName: "pg-one",
			databaseName: "mydb",
			databaseUser: "myuser",
		});
		expect(built?.ext).toBe("sql.gz");
		expect(built?.containerSearch).toContain("pg-one");
		expect(built?.command).toContain("pg_dump");
		expect(built?.command).toContain("mydb");
	});

	it("builds a mysql dump command using databaseRootPassword", () => {
		const built = buildDumpCommand("mysql", {
			appName: "mysql-one",
			databaseName: "mydb",
			databaseRootPassword: "rootpass",
		});
		expect(built?.command).toContain("mysqldump");
		expect(built?.command).toContain("rootpass");
	});

	it("builds a mariadb dump command using databaseUser + databasePassword", () => {
		const built = buildDumpCommand("mariadb", {
			appName: "maria-one",
			databaseName: "mydb",
			databaseUser: "u",
			databasePassword: "p",
		});
		expect(built?.command).toContain("mariadb-dump");
	});

	it("builds a mongo dump command", () => {
		const built = buildDumpCommand("mongo", {
			appName: "mongo-one",
			databaseName: "mydb",
			databaseUser: "u",
			databasePassword: "p",
		});
		expect(built?.ext).toBe("archive.gz");
		expect(built?.command).toContain("mongodump");
		expect(built?.command).toContain("--archive --gzip");
		expect(built?.command).not.toContain("-d ");
	});

	it("builds a libsql dump command over sqld's iku.db data directory", () => {
		const built = buildDumpCommand("libsql", { appName: "libsql-one" });
		expect(built?.ext).toBe("tar.gz");
		expect(built?.command).toContain("iku.db");
		expect(built?.command).not.toContain("libsql-one");
	});

	it("returns undefined for a non-dumpable service type", () => {
		expect(buildDumpCommand("redis", { appName: "redis-one" })).toBeUndefined();
		expect(
			buildDumpCommand("application", { appName: "app-one" }),
		).toBeUndefined();
	});
});

describe("buildComposeDumpCommand", () => {
	it("builds from metadata.mariadb when databaseType is mariadb", () => {
		const built = buildComposeDumpCommand({
			appName: "stack-one",
			serviceName: "db",
			database: "mydb",
			databaseType: "mariadb",
			metadata: { mariadb: { databaseUser: "u", databasePassword: "p" } },
		});
		expect(built?.command).toContain("mariadb-dump");
		expect(built?.containerSearch).toContain("stack-one");
	});

	it("returns undefined when the matching metadata block is missing", () => {
		const built = buildComposeDumpCommand({
			appName: "stack-one",
			serviceName: "db",
			database: "mydb",
			databaseType: "mongo",
			metadata: {},
		});
		expect(built).toBeUndefined();
	});
});

const baseScope: ExportScope = {
	includeEnvSecrets: true,
	shared: {},
	files: {
		applicationSources: true,
		composeFiles: true,
		traefikRaw: true,
		customCertificates: true,
	},
	dumps: { mode: "embed" },
	includeBackupSchedules: true,
};

const emptyServiceArrays = {
	mysql: [],
	mariadb: [],
	mongo: [],
	libsql: [],
	compose: [],
};

const buildTree = (
	postgres: Record<string, unknown>[],
	redis: Record<string, unknown>[] = [],
) => ({
	projectId: "project-1",
	name: "my-project",
	organizationId: "org-1",
	env: "",
	environments: [
		{
			environmentId: "env-1",
			name: "production",
			env: "",
			applications: [],
			postgres,
			redis,
			...emptyServiceArrays,
		},
	],
});

const fakeDb = (overrides: Record<string, unknown> = {}): TransferDb =>
	({
		query: {
			deployments: { findMany: async () => [] },
			backups: { findFirst: async () => undefined },
			...overrides,
		},
	}) as any as TransferDb;

let workDir: string;

beforeEach(async () => {
	workDir = await mkdtemp(join(tmpdir(), "transfer-dumps-"));
});

afterEach(async () => {
	await rm(workDir, { recursive: true, force: true });
});

describe("createDumps / embed mode", () => {
	it("writes a dump per dumpable service via the injected runDump and records its size", async () => {
		const tree = buildTree([
			{
				postgresId: "pg-1",
				appName: "pg-one",
				databaseName: "db",
				databaseUser: "u",
				databasePassword: "p",
				serverId: null,
				backups: [],
			},
		]);

		const { dumps, warnings } = await createDumps(
			fakeDb(),
			tree as any,
			baseScope,
			local(workDir),
			{
				runDump: async (_serverId, _cmd, localPath) => {
					await writeFile(localPath.path, Buffer.alloc(100, 1));
				},
			},
		);

		expect(warnings).toHaveLength(0);
		expect(dumps).toEqual([
			{
				serviceId: "pg-1",
				serviceType: "postgres",
				mode: "embed",
				ext: "sql.gz",
				path: "dumps/pg-1.sql.gz",
				bytes: 100,
			},
		]);
		expect(existsSync(join(workDir, "dumps", "pg-1.sql.gz"))).toBe(true);
	});

	it("notes that admin users are not restored for a mongo dump", async () => {
		const tree = buildTree([]);
		tree.environments[0]!.mongo = [
			{
				mongoId: "mongo-1",
				appName: "mongo-one",
				databaseUser: "u",
				databasePassword: "p",
				serverId: null,
				backups: [],
			},
		] as any;

		const { dumps, warnings } = await createDumps(
			fakeDb(),
			tree as any,
			baseScope,
			local(workDir),
			{
				runDump: async (_serverId, _cmd, localPath) => {
					await writeFile(localPath.path, Buffer.alloc(10, 1));
				},
			},
		);

		expect(dumps).toHaveLength(1);
		expect(warnings.map((w) => w.code)).toEqual([
			"MONGO_ADMIN_USERS_NOT_RESTORED",
		]);
	});

	it("skips redis (no dump mechanism)", async () => {
		const tree = buildTree(
			[],
			[
				{
					redisId: "redis-1",
					appName: "redis-one",
					serverId: null,
					backups: [],
				},
			],
		);

		const { dumps } = await createDumps(
			fakeDb(),
			tree as any,
			baseScope,
			local(workDir),
			{
				runDump: async (_s, _c, localPath) => writeFile(localPath.path, "x"),
			},
		);

		expect(dumps).toHaveLength(0);
	});

	it("does nothing when dumps.mode is none", async () => {
		const tree = buildTree([
			{
				postgresId: "pg-1",
				appName: "pg-one",
				databaseName: "db",
				databaseUser: "u",
				serverId: null,
				backups: [],
			},
		]);

		const { dumps, warnings } = await createDumps(
			fakeDb(),
			tree as any,
			{ ...baseScope, dumps: { mode: "none" } },
			local(workDir),
			{
				runDump: async () => {
					throw new Error("should not be called");
				},
			},
		);

		expect(dumps).toHaveLength(0);
		expect(warnings).toHaveLength(0);
		expect(existsSync(join(workDir, "dumps"))).toBe(false);
	});

	it("emits DUMP_SKIPPED_TOO_LARGE and deletes the file when over the byte limit", async () => {
		const tree = buildTree([
			{
				postgresId: "pg-1",
				appName: "pg-one",
				databaseName: "db",
				databaseUser: "u",
				serverId: null,
				backups: [],
			},
		]);

		const { dumps, warnings } = await createDumps(
			fakeDb(),
			tree as any,
			baseScope,
			local(workDir),
			{
				runDump: async (_s, _c, localPath) => {
					const { open } = await import("node:fs/promises");
					const handle = await open(localPath.path, "w");
					await handle.truncate(MAX_EMBEDDED_DUMP_BYTES + 1);
					await handle.close();
				},
			},
		);

		expect(dumps).toHaveLength(0);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.code).toBe("DUMP_SKIPPED_TOO_LARGE");
		expect(existsSync(join(workDir, "dumps", "pg-1.sql.gz"))).toBe(false);
	});

	it("emits DUMP_FAILED and doesn't add a dumps entry when runDump throws", async () => {
		const tree = buildTree([
			{
				postgresId: "pg-1",
				appName: "pg-one",
				databaseName: "db",
				databaseUser: "u",
				serverId: null,
				backups: [],
			},
		]);

		const { dumps, warnings } = await createDumps(
			fakeDb(),
			tree as any,
			baseScope,
			local(workDir),
			{
				runDump: async () => {
					throw new Error("pg_dump: connection refused");
				},
			},
		);

		expect(dumps).toHaveLength(0);
		expect(existsSync(join(workDir, "dumps"))).toBe(false);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.code).toBe("DUMP_FAILED");
		expect(warnings[0]?.message).toContain("pg-one");
		expect(warnings[0]?.affected).toContainEqual(
			expect.objectContaining({ serviceId: "pg-1" }),
		);
	});

	it("emits COMPOSE_DUMP_NOT_RESTORABLE for a compose backup", async () => {
		const tree = {
			projectId: "project-1",
			name: "my-project",
			organizationId: "org-1",
			env: "",
			environments: [
				{
					environmentId: "env-1",
					name: "production",
					env: "",
					applications: [],
					postgres: [],
					redis: [],
					mysql: [],
					mariadb: [],
					mongo: [],
					libsql: [],
					compose: [
						{
							composeId: "compose-1",
							appName: "stack-one",
							serverId: null,
							backups: [
								{
									backupId: "backup-1",
									serviceName: "db",
									database: "mydb",
									databaseType: "mariadb",
									metadata: {
										mariadb: { databaseUser: "u", databasePassword: "p" },
									},
								},
							],
						},
					],
				},
			],
		};

		const { dumps, warnings } = await createDumps(
			fakeDb(),
			tree as any,
			baseScope,
			local(workDir),
			{
				runDump: async (_s, _c, localPath) => writeFile(localPath.path, "x"),
			},
		);

		expect(dumps).toHaveLength(1);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.code).toBe("COMPOSE_DUMP_NOT_RESTORABLE");
		expect(warnings[0]?.affected).toEqual([
			{
				serviceId: "compose-1",
				serviceType: "compose",
				serviceName: "stack-one",
				environmentId: "env-1",
			},
		]);
		expect(dumps[0]?.serviceId).toBe("compose-1");
		expect(dumps[0]?.mode).toBe("embed");
		expect(dumps[0]?.mode === "embed" ? dumps[0].path : undefined).toContain(
			"backup-1",
		);
	});

	it("does not emit COMPOSE_DUMP_NOT_RESTORABLE when the compose dump itself fails", async () => {
		const tree = {
			projectId: "project-1",
			name: "my-project",
			organizationId: "org-1",
			env: "",
			environments: [
				{
					environmentId: "env-1",
					name: "production",
					env: "",
					applications: [],
					postgres: [],
					redis: [],
					mysql: [],
					mariadb: [],
					mongo: [],
					libsql: [],
					compose: [
						{
							composeId: "compose-1",
							appName: "stack-one",
							serverId: null,
							backups: [
								{
									backupId: "backup-1",
									serviceName: "db",
									database: "mydb",
									databaseType: "mariadb",
									metadata: {
										mariadb: { databaseUser: "u", databasePassword: "p" },
									},
								},
							],
						},
					],
				},
			],
		};

		const { dumps, warnings } = await createDumps(
			fakeDb(),
			tree as any,
			baseScope,
			local(workDir),
			{
				runDump: async () => {
					throw new Error("Container not found");
				},
			},
		);

		expect(dumps).toHaveLength(0);
		expect(warnings.map((warning) => warning.code)).toEqual(["DUMP_FAILED"]);
		expect(existsSync(join(workDir, "dumps"))).toBe(false);
	});
});

describe("createDumps / referenceLastBackup mode", () => {
	it("references the destination + key prefix of the latest successful backup", async () => {
		const tree = buildTree([
			{
				postgresId: "pg-1",
				appName: "pg-one",
				databaseName: "db",
				databaseUser: "u",
				serverId: null,
				backups: [{ backupId: "backup-1" }],
			},
		]);

		const db = fakeDb({
			deployments: {
				findMany: async () => [{ backupId: "backup-1", status: "done" }],
			},
			backups: {
				findFirst: async () => ({
					backupId: "backup-1",
					destinationId: "dest-1",
					prefix: "/nightly/",
				}),
			},
		});

		const { dumps } = await createDumps(
			db,
			tree as any,
			{ ...baseScope, dumps: { mode: "referenceLastBackup" } },
			local(workDir),
		);

		expect(dumps).toEqual([
			{
				serviceId: "pg-1",
				serviceType: "postgres",
				mode: "referenceLastBackup",
				destinationId: "dest-1",
				keyPrefix: "pg-one/nightly/",
			},
		]);
	});

	it("skips a service with no successful backup deployment", async () => {
		const tree = buildTree([
			{
				postgresId: "pg-1",
				appName: "pg-one",
				databaseName: "db",
				databaseUser: "u",
				serverId: null,
				backups: [{ backupId: "backup-1" }],
			},
		]);

		const { dumps } = await createDumps(
			fakeDb(),
			tree as any,
			{ ...baseScope, dumps: { mode: "referenceLastBackup" } },
			local(workDir),
		);

		expect(dumps).toHaveLength(0);
	});
});

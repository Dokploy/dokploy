import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
	backupCommandExamples,
	parseBackupCommand,
} from "@dokploy/server/db/schema/backup-command";
import { backupMetadataSchema } from "@dokploy/server/db/schema/backup-metadata";
import {
	apiCreateBackup,
	apiUpdateBackup,
} from "@dokploy/server/db/schema/backups";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import {
	type ComposeBackupInput,
	getCustomBackupCommand,
} from "@dokploy/server/utils/backups/compose-command";
import {
	generateBackupCommand,
	getMariadbBackupCommand,
	getMongoBackupCommand,
	getMysqlBackupCommand,
	getPostgresBackupCommand,
} from "@dokploy/server/utils/backups/utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = mkdtempSync(path.join(tmpdir(), "compose-backup-options-"));
const record = path.join(directory, "args.json");
const marker = path.join(directory, "injected");
const password = `quoted ' " password $HOME $(touch ${marker})`;
const base = {
	database: "app",
	databaseType: "postgres" as const,
	metadata: {},
};
beforeAll(() => {
	writeFileSync(
		path.join(directory, "docker"),
		`#!/bin/bash
shift
while [ "$1" = "-e" ]; do export "$2"; shift 2; done
shift 2
exec "$@"
`,
	);
	chmodSync(path.join(directory, "docker"), 0o755);
	for (const tool of ["pg_dump", "mysqldump", "mariadb-dump", "mongodump"]) {
		writeFileSync(
			path.join(directory, tool),
			`#!${process.execPath}
const fs = require('node:fs');
fs.writeFileSync(process.env.RECORD, JSON.stringify({args:process.argv.slice(2), password:process.env.PGPASSWORD, envPassword:process.env.DB_PASSWORD}));
if(process.env.DUMP_FAIL) process.exit(23);
process.stdout.write('fixture payload');
`,
		);
		chmodSync(path.join(directory, tool), 0o755);
	}
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const run = (input: ComposeBackupInput, extra: Record<string, string> = {}) => {
	const command = generateBackupCommand({
		...input,
		backupType: "compose",
	} as BackupSchedule)!;
	return spawnSync("bash", ["-o", "pipefail", "-c", command], {
		env: {
			...process.env,
			PATH: `${directory}:${process.env.PATH}`,
			CONTAINER_ID: "fixture",
			RECORD: record,
			...extra,
		},
		timeout: 5_000,
	});
};
const captured = () => JSON.parse(readFileSync(record, "utf8"));

const legacyConfigurations = [
	{
		type: "postgres",
		connection: { databaseUser: "backup user" },
		command: getPostgresBackupCommand("app", "backup user"),
		args: [
			"-Fc",
			"--no-acl",
			"--no-owner",
			"-h",
			"localhost",
			"-U",
			"backup user",
			"--no-password",
			"app",
		],
	},
	{
		type: "mysql",
		connection: { databaseRootPassword: password },
		command: getMysqlBackupCommand("app", password),
		args: [
			"--default-character-set=utf8mb4",
			"-u",
			"root",
			`--password=${password}`,
			"--single-transaction",
			"--no-tablespaces",
			"--quick",
			"app",
		],
	},
	{
		type: "mariadb",
		connection: { databaseUser: "backup user", databasePassword: password },
		command: getMariadbBackupCommand("app", "backup user", password),
		args: [
			"--user=backup user",
			`--password=${password}`,
			"--single-transaction",
			"--quick",
			"--databases",
			"app",
		],
	},
	{
		type: "mongo",
		connection: { databaseUser: "backup user", databasePassword: password },
		command: getMongoBackupCommand("app", "backup user", password),
		args: [
			"-d",
			"app",
			"-u",
			"backup user",
			"-p",
			password,
			"--archive",
			"--authenticationDatabase",
			"admin",
			"--gzip",
		],
	},
] as const;

describe("existing backup compatibility", () => {
	it.each(legacyConfigurations)(
		"executes the unchanged $type command for saved Compose metadata",
		({ type, connection, command, args }) => {
			const input: ComposeBackupInput = {
				...base,
				databaseType: type,
				metadata: { [type]: connection },
			};
			expect(
				generateBackupCommand({
					...input,
					backupType: "compose",
				} as BackupSchedule),
			).toBe(command);
			expect(run(input).status).toBe(0);
			expect(captured().args).toEqual(args);
			expect(existsSync(marker)).toBe(false);
		},
	);
	it.each(legacyConfigurations)(
		"keeps $type on the original builder when optional fields are untouched or cleared",
		({ type, connection, command }) => {
			const input: ComposeBackupInput & { backupType: "compose" } = {
				...base,
				databaseType: type,
				backupType: "compose",
				metadata: {
					backupMode: "default",
					custom: { script: "unused saved command" },
					[type]: {
						...connection,
						databaseHost: "",
						additionalArgs: [],
						connectionUri: "",
					},
				},
			};
			expect(generateBackupCommand(input as BackupSchedule)).toBe(command);
		},
	);
	it.each(legacyConfigurations)(
		"keeps managed $type backups on the original builder",
		({ type, connection, command }) => {
			expect(
				generateBackupCommand({
					...base,
					backupType: "database",
					databaseType: type,
					metadata: null,
					[type]: connection,
				} as BackupSchedule),
			).toBe(command);
		},
	);
	it("preserves inherited PostgreSQL authentication unless custom credentials are requested", () => {
		const metadata = {
			postgres: { databaseUser: "postgres", databasePort: 6543 },
		};
		expect(run({ ...base, metadata }, { PGPASSWORD: "inherited" }).status).toBe(
			0,
		);
		expect(captured().password).toBe("inherited");
		expect(
			run(
				{
					...base,
					metadata: {
						...metadata,
						backupMode: "custom",
						custom: { script: "pg_dump" },
					},
				},
				{ PGPASSWORD: "inherited" },
			).status,
		).toBe(0);
		expect(captured().password).toBe("");
	});
});

describe("Compose connection overrides", () => {
	it("keeps PostgreSQL's legacy options and passes a password without shell evaluation", () => {
		const result = run({
			...base,
			metadata: {
				postgres: { databaseUser: "app user", databasePassword: password },
			},
		});
		expect(result.status).toBe(0);
		expect(gunzipSync(result.stdout).toString()).toBe("fixture payload");
		expect(captured()).toMatchObject({
			args: [
				"-Fc",
				"--no-password",
				"--no-acl",
				"--no-owner",
				"--host=localhost",
				"--username=app user",
				"--dbname=app",
			],
			password,
		});
		expect(existsSync(marker)).toBe(false);
	});
	it.each(["postgres", "mysql", "mariadb", "mongo"] as const)(
		"uses %s host, port, user and literal extra arguments",
		(type) => {
			const host = `proxy ' $(touch ${marker})`;
			const option =
				type === "postgres"
					? "exclude-table"
					: type === "mongo"
						? "collection"
						: "ignore-table";
			const argument = `--${option}=data $(touch ${marker})`;
			const result = run({
				...base,
				databaseType: type,
				metadata: {
					[type]: {
						databaseHost: host,
						databasePort: 6543,
						databaseUser: "backup user",
						databasePassword: password,
						additionalArgs: [argument],
					},
				},
			});
			expect(result.status).toBe(0);
			const { args } = captured();
			expect(args).toContain(`--host=${host}`);
			expect(args).toContain("--port=6543");
			expect(args).toContain(argument);
			expect(existsSync(marker)).toBe(false);
		},
	);
	it.each(["mysql", "mariadb"] as const)(
		"forces TCP for a %s port-only override",
		(type) => {
			expect(
				run({
					...base,
					databaseType: type,
					metadata: { [type]: { databasePort: 3307 } },
				}).status,
			).toBe(0);
			expect(captured().args).toEqual(
				expect.arrayContaining([
					"--protocol=TCP",
					"--host=127.0.0.1",
					"--port=3307",
				]),
			);
		},
	);
	it("preserves old MySQL root passwords and local socket behavior", () => {
		expect(
			run({
				...base,
				databaseType: "mysql",
				metadata: { mysql: { databaseRootPassword: password } },
			}).status,
		).toBe(0);
		expect(captured().args).toEqual(expect.arrayContaining(["-u", "root"]));
		expect(captured().args).toContain(`--password=${password}`);
		expect(captured().args).not.toContain("--protocol=TCP");
	});
	it.each(["postgres", "mongo"] as const)(
		"makes the %s URI authoritative",
		(type) => {
			const connectionUri =
				type === "postgres"
					? "postgresql://user:p%40ss@proxy:6543/app?sslmode=require"
					: "mongodb://user:p%40ss@proxy:27018/?authSource=users";
			expect(
				run({
					...base,
					databaseType: type,
					metadata: {
						[type]: {
							connectionUri,
							databaseHost: "ignored",
							databasePort: 1,
							databasePassword: "ignored",
						},
					},
				}).status,
			).toBe(0);
			expect(captured().args).toContain(
				`${type === "postgres" ? "--dbname" : "--uri"}=${connectionUri}`,
			);
			expect(captured().args.join(" ")).not.toContain("ignored");
		},
	);
	it("supports MongoDB without authentication and a custom authentication database", () => {
		expect(
			run({
				...base,
				databaseType: "mongo",
				metadata: { mongo: { authenticationDatabase: "users" } },
			}).status,
		).toBe(0);
		expect(captured().args).toEqual([
			"--archive",
			"--gzip",
			"--db=app",
			"--authenticationDatabase=users",
		]);
	});
	it.each(["postgres", "mysql", "mariadb", "mongo"] as const)(
		"propagates %s dump failures",
		(type) => {
			expect(
				run({ ...base, databaseType: type }, { DUMP_FAIL: "1" }).status,
			).toBe(23);
		},
	);
});

describe("custom backup command security", () => {
	it.each(
		Object.keys(backupCommandExamples) as Array<
			keyof typeof backupCommandExamples
		>,
	)("accepts the guided %s backup command", (engine) => {
		expect(() =>
			parseBackupCommand(backupCommandExamples[engine], engine),
		).not.toThrow();
	});
	it.each([
		"rm -rf /",
		"pg_dump; rm -rf /",
		"pg_dump | cat",
		"pg_dump > /etc/dokploy/config",
		"pg_dump $(id)",
		"pg_dump `id`",
		"pg_dump\nrm -rf /",
		"pg_dump --file=/etc/dokploy/config",
		"pg_dump --dbname=other",
		"pg_dump --host=other",
		"pg_dump --username=root",
		"pg_dump --format=directory",
		"pg_dump --exclude-table=events --help",
		"pg_dump --exclude-table=$HOME",
	])("rejects unsafe or connection-changing text: %s", (command) => {
		expect(() => parseBackupCommand(command, "postgres")).toThrow();
	});
	it("uses Dokploy's existing docker exec pipeline without starting a service", () => {
		const command = getCustomBackupCommand(
			{
				...base,
				metadata: {
					backupMode: "custom",
					postgres: { databasePassword: password },
					custom: { script: "pg_dump --no-owner" },
				},
			},
			300,
		);
		expect(command).toMatch(/^docker exec /);
		expect(command).toContain('"$CONTAINER_ID" timeout -k 10 300 pg_dump');
		expect(command).not.toContain("docker run");
		expect(command).not.toContain("bash -c");
		expect(command).not.toContain("sh -c");
	});
	it("validates and executes a custom dump without evaluating shell code", () => {
		const result = run({
			...base,
			metadata: {
				backupMode: "custom",
				postgres: { databasePassword: password },
				custom: { script: "pg_dump --schema-only" },
			},
		});
		expect(result.status).toBe(0);
		expect(gunzipSync(result.stdout).toString()).toBe("fixture payload");
		expect(captured().args).toContain("--schema-only");
		expect(existsSync(marker)).toBe(false);
	});
	it("switches back to the default while preserving the custom command", () => {
		expect(
			run({
				...base,
				metadata: {
					backupMode: "default",
					custom: { script: "pg_dump --schema-only" },
				},
			}).status,
		).toBe(0);
		expect(captured().args).toContain("-Fc");
	});
});

describe("backup API validation", () => {
	const input = {
		schedule: "0 0 * * *",
		enabled: false,
		prefix: "/",
		destinationId: "destination",
		database: "app",
		databaseType: "postgres",
		backupType: "compose",
		composeId: "compose",
		serviceName: "postgres",
		metadata: {},
	};
	it.each([0, -1, 65536, 5432.5, "5432", Number.NaN])(
		"rejects invalid port %s for create and update",
		(port) => {
			for (const type of ["postgres", "mysql", "mariadb", "mongo"]) {
				const value = {
					...input,
					backupId: "backup",
					keepLatestCount: 1,
					metadata: { [type]: { databasePort: port } },
				};
				expect(apiCreateBackup.safeParse(value).success).toBe(false);
				expect(apiUpdateBackup.safeParse(value).success).toBe(false);
			}
		},
	);
	it("accepts legacy null/omitted metadata and both port boundaries", () => {
		for (const metadata of [
			undefined,
			null,
			{},
			{ postgres: { databasePort: 1 } },
			{ mongo: { databasePort: 65535 } },
		])
			expect(apiCreateBackup.safeParse({ ...input, metadata }).success).toBe(
				true,
			);
	});
	it("requires a script for custom mode and a Compose service", () => {
		expect(
			apiCreateBackup.safeParse({
				...input,
				metadata: { backupMode: "custom" },
			}).success,
		).toBe(false);
		expect(
			apiCreateBackup.safeParse({
				...input,
				metadata: { backupMode: "custom", custom: { script: " " } },
			}).success,
		).toBe(false);
		expect(
			apiCreateBackup.safeParse({ ...input, serviceName: "" }).success,
		).toBe(false);
		expect(
			apiCreateBackup.safeParse({
				...input,
				backupType: "database",
				metadata: { backupMode: "custom", custom: { script: "pg_dump" } },
			}).success,
		).toBe(false);
	});
	it("rejects null bytes, unsupported URI schemes and output redirection options", () => {
		for (const metadata of [
			{ postgres: { databasePassword: "bad\0value" } },
			{ postgres: { connectionUri: "https://host" } },
			{ mongo: { additionalArgs: ["--out=/tmp/archive"] } },
			{ mysql: { additionalArgs: ["--result-file=/tmp/archive"] } },
		])
			expect(backupMetadataSchema.safeParse(metadata).success).toBe(false);
	});
	it.each(["postgres", "mysql", "mariadb", "mongo"] as const)(
		"cleared %s connection inputs restore the defaults",
		(engine) => {
			const metadata = backupMetadataSchema.parse({
				[engine]: { databaseHost: "", databaseUser: "", databasePassword: "" },
			});
			expect(metadata[engine]?.databaseUser).toBeUndefined();
			expect(metadata[engine]?.databasePassword).toBeUndefined();
			expect(metadata[engine]?.databaseHost).toBeUndefined();
			const custom = {
				...metadata,
				backupMode: "custom" as const,
				custom: { script: backupCommandExamples[engine] },
			};
			const command = getCustomBackupCommand({
				...base,
				databaseType: engine,
				metadata: custom,
			});
			if (engine === "postgres")
				expect(command).toContain("--username\\=postgres");
			else if (engine !== "mongo") expect(command).toContain("--user\\=root");
		},
	);
});

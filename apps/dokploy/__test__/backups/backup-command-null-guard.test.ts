import type { BackupSchedule } from "@dokploy/server/services/backup";
import { getDatabaseType } from "@dokploy/server/utils/backups/compose";
import {
	generateBackupCommand,
	getBackupCommand,
} from "@dokploy/server/utils/backups/utils";
import { describe, expect, it } from "vitest";

// Minimal builder for `BackupSchedule` (the joined row returned by
// `findBackupById`). The pure functions under test only read a handful of
// fields (backupType, databaseType, metadata, database, serviceName, and the
// relevant relation's appName / composeType); every other relation defaults to
// null. The whole object is asserted into shape with a double cast so the tests
// don't have to fabricate the full destination / relation graph.
const makeBackup = (
	over: Partial<BackupSchedule> &
		Pick<BackupSchedule, "backupType" | "databaseType">,
): BackupSchedule =>
	({
		backupId: "backup-1",
		appName: "app-backup",
		schedule: "0 * * * *",
		enabled: true,
		database: "db",
		prefix: "prefix",
		serviceName: "svc",
		destinationId: "dest-1",
		keepLatestCount: null,
		includeEncryptionKey: true,
		composeId: null,
		postgresId: null,
		mariadbId: null,
		mysqlId: null,
		mongoId: null,
		libsqlId: null,
		userId: null,
		metadata: undefined,
		postgres: null,
		mysql: null,
		mariadb: null,
		mongo: null,
		libsql: null,
		compose: null,
		...over,
	}) as unknown as BackupSchedule;

const makeCompose = (
	over: Partial<NonNullable<BackupSchedule["compose"]>> = {},
): NonNullable<BackupSchedule["compose"]> =>
	({
		composeId: "compose-1",
		appName: "myapp",
		composeType: "docker-compose",
		...over,
	}) as unknown as NonNullable<BackupSchedule["compose"]>;

const RCLONE_FLAGS = ["--s3-access-key-id=k", "--s3-secret-access-key=s"];
const RCLONE_DEST = ":s3:bucket/app_svc/prefix/file.sql.gz";
const LOG_PATH = "/tmp/backup.log";

describe("generateBackupCommand", () => {
	describe("returns a dump command for supported configs", () => {
		const valid: Array<[string, BackupSchedule]> = [
			[
				"database postgres",
				makeBackup({
					backupType: "database",
					databaseType: "postgres",
					postgres: { appName: "pg-app", databaseUser: "u" } as any,
				}),
			],
			[
				"database mysql",
				makeBackup({
					backupType: "database",
					databaseType: "mysql",
					mysql: { appName: "my-app", databaseRootPassword: "p" } as any,
				}),
			],
			[
				"database mariadb",
				makeBackup({
					backupType: "database",
					databaseType: "mariadb",
					mariadb: {
						appName: "maria-app",
						databaseUser: "u",
						databasePassword: "p",
					} as any,
				}),
			],
			[
				"database mongo",
				makeBackup({
					backupType: "database",
					databaseType: "mongo",
					mongo: {
						appName: "mongo-app",
						databaseUser: "u",
						databasePassword: "p",
					} as any,
				}),
			],
			[
				"database libsql",
				makeBackup({
					backupType: "database",
					databaseType: "libsql",
					libsql: { appName: "lib-app" } as any,
				}),
			],
			[
				"compose postgres with metadata.postgres",
				makeBackup({
					backupType: "compose",
					databaseType: "postgres",
					compose: makeCompose(),
					metadata: { postgres: { databaseUser: "u" } },
				}),
			],
			[
				"compose mysql with metadata.mysql",
				makeBackup({
					backupType: "compose",
					databaseType: "mysql",
					compose: makeCompose(),
					metadata: { mysql: { databaseRootPassword: "p" } },
				}),
			],
			[
				"compose mariadb with metadata.mariadb",
				makeBackup({
					backupType: "compose",
					databaseType: "mariadb",
					compose: makeCompose(),
					metadata: {
						mariadb: { databaseUser: "u", databasePassword: "p" },
					},
				}),
			],
			[
				"compose mongo with metadata.mongo",
				makeBackup({
					backupType: "compose",
					databaseType: "mongo",
					compose: makeCompose(),
					metadata: { mongo: { databaseUser: "u", databasePassword: "p" } },
				}),
			],
		];
		const expectedNeedle: Record<string, string> = {
			postgres: "pg_dump",
			mysql: "mysqldump",
			mariadb: "mariadb-dump",
			mongo: "mongodump",
			libsql: "tar",
		};

		for (const [label, backup] of valid) {
			it(label, () => {
				const cmd = generateBackupCommand(backup);
				expect(cmd).not.toBeNull();
				expect(typeof cmd).toBe("string");
				expect(cmd).toContain(expectedNeedle[backup.databaseType]);
			});
		}
	});

	describe("returns null for compose configs the server accepts but cannot dump", () => {
		const unsupported: Array<[string, BackupSchedule["databaseType"]]> = [
			["compose libsql (no compose branch exists at all)", "libsql"],
			["compose postgres without metadata.postgres", "postgres"],
			["compose mysql without metadata.mysql", "mysql"],
			["compose mariadb without metadata.mariadb", "mariadb"],
			["compose mongo without metadata.mongo", "mongo"],
		];

		for (const [label, databaseType] of unsupported) {
			it(label, () => {
				const cmd = generateBackupCommand(
					makeBackup({
						backupType: "compose",
						databaseType,
						compose: makeCompose(),
						metadata: undefined,
					}),
				);
				expect(cmd).toBeNull();
			});
		}
	});

	it("web-server throws a typed unsupported error (asymmetry reference)", () => {
		expect(() =>
			generateBackupCommand(
				makeBackup({ backupType: "compose", databaseType: "web-server" }),
			),
		).toThrow(/Database type not supported: web-server/);
	});
});

describe("getBackupCommand null guard", () => {
	// Regression: previously `generateBackupCommand`'s `null` return was
	// interpolated straight into the bash pipeline, producing the literal
	// dump command `null` (`{ null | rclone rcat ...; }`), which fails on every
	// run under `set -eo pipefail`. The guard must turn that into a typed error
	// naming the unsupported combination instead of emitting a broken script.
	const unsupported: Array<[string, BackupSchedule["databaseType"]]> = [
		["compose libsql", "libsql"],
		["compose postgres without metadata", "postgres"],
		["compose mysql without metadata", "mysql"],
		["compose mariadb without metadata", "mariadb"],
		["compose mongo without metadata", "mongo"],
	];

	for (const [label, databaseType] of unsupported) {
		const backup = makeBackup({
			backupType: "compose",
			databaseType,
			compose: makeCompose(),
			metadata: undefined,
		});

		it(`throws (does not build a 'null' pipeline) for ${label}`, () => {
			expect(() =>
				getBackupCommand(backup, RCLONE_FLAGS, RCLONE_DEST, LOG_PATH),
			).toThrow();
		});

		it(`error names backupType and databaseType for ${label}`, () => {
			expect(() =>
				getBackupCommand(backup, RCLONE_FLAGS, RCLONE_DEST, LOG_PATH),
			).toThrow(
				new RegExp(
					`Backup not supported for backupType=compose databaseType=${databaseType}`,
				),
			);
		});
	}

	it("never emits a pipeline whose dump side is the literal token `null`", () => {
		const backup = makeBackup({
			backupType: "compose",
			databaseType: "libsql",
			compose: makeCompose(),
		});
		let produced: string | undefined;
		try {
			produced = getBackupCommand(
				backup,
				RCLONE_FLAGS,
				RCLONE_DEST,
				LOG_PATH,
			) as string;
		} catch {
			// expected: the guard throws before any interpolation
		}
		// If the guard were ever bypassed and a script was returned, the dump
		// side of the pipe must never be the bare literal `null`.
		if (typeof produced === "string") {
			expect(produced).not.toContain("{ null |");
		}
	});

	it("builds a real pipeline for a supported compose config", () => {
		const backup = makeBackup({
			backupType: "compose",
			databaseType: "postgres",
			compose: makeCompose(),
			metadata: { postgres: { databaseUser: "u" } },
		});
		const script = getBackupCommand(
			backup,
			RCLONE_FLAGS,
			RCLONE_DEST,
			LOG_PATH,
		);
		expect(script).toContain("rclone rcat");
		expect(script).toContain("pg_dump");
		expect(script).not.toContain("{ null |");
	});

	it("builds a real pipeline for a supported database config", () => {
		const backup = makeBackup({
			backupType: "database",
			databaseType: "postgres",
			postgres: { appName: "pg-app", databaseUser: "u" } as any,
		});
		const script = getBackupCommand(
			backup,
			RCLONE_FLAGS,
			RCLONE_DEST,
			LOG_PATH,
		);
		expect(script).toContain("rclone rcat");
		expect(script).toContain("pg_dump");
		expect(script).not.toContain("{ null |");
	});
});

describe("getDatabaseType notification labeling", () => {
	// The compose backup error/success notification builds its `databaseType`
	// label from this map. libsql was previously mislabeled as "mongodb".
	const cases: Array<[BackupSchedule["databaseType"], string]> = [
		["mongo", "mongodb"],
		["postgres", "postgres"],
		["mariadb", "mariadb"],
		["mysql", "mysql"],
		["libsql", "libsql"],
	];
	for (const [input, expected] of cases) {
		it(`labels ${input} as ${expected}`, () => {
			expect(getDatabaseType(input)).toBe(expected);
		});
	}

	it("labels libsql correctly (regression: was 'mongodb')", () => {
		expect(getDatabaseType("libsql")).not.toBe("mongodb");
	});
});

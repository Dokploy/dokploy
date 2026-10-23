import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import {
	generateBackupCommand,
	getMysqlBackupCommand,
} from "@dokploy/server/utils/backups/utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = mkdtempSync(join(tmpdir(), "mysql-backup-"));
const database = "app database's café";
const password = "synthetic ' $password; value";

beforeAll(() => {
	writeFileSync(
		join(directory, "docker"),
		`#!/bin/bash
shift
envs=()
while [ "$1" = "-e" ]; do envs+=("$2"); shift 2; done
shift 2
exec env "\${envs[@]}" "$@"
`,
		{ mode: 0o755 },
	);
	writeFileSync(
		join(directory, "mysqldump"),
		`#!/bin/bash
printf '%s\\n' "$@"
exit "\${DUMP_EXIT_CODE:-0}"
`,
		{ mode: 0o755 },
	);
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const run = (command: string, exitCode = 0) =>
	spawnSync("bash", ["-c", command], {
		env: {
			NODE_ENV: "test",
			PATH: `${directory}:/usr/bin:/bin`,
			CONTAINER_ID: "synthetic-mysql",
			DUMP_EXIT_CODE: String(exitCode),
		},
	});

describe("MySQL stored-object backups", () => {
	for (const backupType of ["database", "compose"] as const) {
		it(`includes routines and events in ${backupType} backups without changing database scope or credentials`, () => {
			const backup = {
				backupType,
				databaseType: "mysql",
				database,
				mysql:
					backupType === "database" ? { databaseRootPassword: password } : null,
				metadata: {
					mysql: {
						databaseRootPassword:
							backupType === "compose" ? password : "unused-compose-password",
					},
				},
			} as BackupSchedule;
			const command = generateBackupCommand(backup);
			expect(command).not.toBeNull();
			const dump = run(command || "");
			expect(dump.status).toBe(0);
			const result = spawnSync("gzip", ["-dc"], { input: dump.stdout });
			expect(result.status).toBe(0);
			expect(result.stdout.toString().trimEnd().split("\n")).toEqual([
				"--default-character-set=utf8mb4",
				"-u",
				"root",
				`--password=${password}`,
				"--single-transaction",
				"--no-tablespaces",
				"--routines",
				"--events",
				"--quick",
				database,
			]);
		});
	}

	it("propagates a dump failure even when gzip succeeds", () => {
		const result = run(getMysqlBackupCommand(database, password), 23);
		expect(result.status).toBe(23);
		expect(spawnSync("gzip", ["-t"], { input: result.stdout }).status).toBe(0);
	});
});

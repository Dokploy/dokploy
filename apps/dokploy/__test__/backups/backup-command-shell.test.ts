import { execFileSync } from "node:child_process";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import { getBackupCommand } from "@dokploy/server/utils/backups/utils";
import { wrapInBash } from "@dokploy/server/utils/process/bash";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Remote commands run in the SSH user's login shell. /bin/sh is the closest
// stand-in for a non-bash login shell (dash on Debian/Ubuntu).
const runInSh = (command: string, env: NodeJS.ProcessEnv = process.env) =>
	execFileSync("/bin/sh", ["-c", command], { env, encoding: "utf8" });

describe("wrapInBash", () => {
	it("runs bash-only options from a POSIX shell", () => {
		expect(runInSh(wrapInBash("set -eo pipefail; echo ok"))).toBe("ok\n");
	});

	it("keeps the script content unchanged", () => {
		const script = "printf '%s|' \"it's\" '$HOME \\ ! `x`'";
		expect(runInSh(wrapInBash(script))).toBe("it's|$HOME \\ ! `x`|");
	});

	it("keeps pipefail effective", () => {
		expect(() =>
			runInSh(wrapInBash("set -eo pipefail; false | true")),
		).toThrow();
	});
});

describe("getBackupCommand", () => {
	let dir: string;

	beforeAll(() => {
		dir = mkdtempSync(path.join(tmpdir(), "dokploy-backup-shell-"));
		writeFileSync(path.join(dir, "docker"), "#!/bin/sh\nexit 0\n");
		chmodSync(path.join(dir, "docker"), 0o755);
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("runs the backup script when the login shell is not bash", () => {
		const logPath = path.join(dir, "backup.log");
		const backup = {
			backupType: "database",
			databaseType: "postgres",
			database: "app",
			prefix: "/English-Program",
			postgres: { appName: "pg-remote", databaseUser: "app" },
		} as unknown as BackupSchedule;

		const command = getBackupCommand(
			backup,
			[],
			":s3:bucket/pg-remote/English-Program/backup.sql.gz",
			logPath,
		);

		expect(() =>
			runInSh(command, { ...process.env, PATH: `${dir}:${process.env.PATH}` }),
		).toThrow();
		expect(readFileSync(logPath, "utf8")).toContain(
			"Error: Container not found",
		);
	});
});

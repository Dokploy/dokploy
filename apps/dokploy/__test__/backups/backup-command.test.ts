import { execSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import { getBackupCommand } from "@dokploy/server/utils/backups/utils";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// The script produced by getBackupCommand is run for real, with `docker` and
// `rclone` replaced by stubs on PATH. The docker stub counts how many times the
// dump is executed — the regression this suite guards against is dumping twice.
let dir: string;
let binDir: string;
let logPath: string;
let counterPath: string;
let uploadPath: string;
let cleanupMarkPath: string;

const write = (path: string, contents: string) => {
	writeFileSync(path, contents);
	chmodSync(path, 0o755);
};

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), "dokploy-backup-cmd-"));
	binDir = join(dir, "bin");
	mkdirSync(binDir);
	logPath = join(dir, "backup.log");
	counterPath = join(dir, "dump-runs");
	uploadPath = join(dir, "uploaded.gz");
	cleanupMarkPath = join(dir, "cleanup-ran");

	// `docker ps` resolves the container id; anything else is the dump itself.
	write(
		join(binDir, "docker"),
		`#!/bin/bash
if [ "$1" = "ps" ]; then echo "container123"; exit 0; fi
echo run >> "${counterPath}"
printf 'DUMP-PAYLOAD'
if [ -n "$DUMP_FAILS" ]; then echo "pg_dump: server closed the connection" >&2; exit 1; fi
exit 0
`,
	);

	write(
		join(dir, "rclone-ok"),
		`#!/bin/bash
cat > "${uploadPath}"
`,
	);

	write(
		join(dir, "rclone-fail"),
		`#!/bin/bash
echo "rclone: failed to create file system" >&2
exit 1
`,
	);

	write(
		join(dir, "rclone-cleanup"),
		`#!/bin/bash
rm -f "${uploadPath}"
touch "${cleanupMarkPath}"
`,
	);
});

afterAll(() => {
	if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
	for (const path of [logPath, counterPath, uploadPath, cleanupMarkPath]) {
		if (existsSync(path)) rmSync(path);
	}
});

const backup = {
	backupId: "backup-id",
	backupType: "database",
	databaseType: "postgres",
	database: "testdb",
	postgres: {
		appName: "test-postgres-app",
		databaseUser: "testuser",
	},
} as unknown as BackupSchedule;

// Runs the generated script; returns the exit code (0 on success).
const run = (rclone: string, opts: { dumpFails?: boolean } = {}) => {
	const command = getBackupCommand(
		backup,
		join(dir, rclone),
		logPath,
		join(dir, "rclone-cleanup"),
	);

	try {
		execSync(command, {
			shell: "/bin/bash",
			stdio: "ignore",
			env: {
				...process.env,
				PATH: `${binDir}:${process.env.PATH}`,
				...(opts.dumpFails ? { DUMP_FAILS: "1" } : {}),
			},
		});
		return 0;
	} catch (error) {
		// @ts-ignore - execSync errors carry the exit status
		return (error?.status as number) ?? 1;
	}
};

const dumpRuns = () =>
	existsSync(counterPath)
		? readFileSync(counterPath, "utf8").trim().split("\n").length
		: 0;

const log = () => (existsSync(logPath) ? readFileSync(logPath, "utf8") : "");

describe("getBackupCommand", () => {
	it("dumps the database exactly once and uploads that stream", () => {
		expect(run("rclone-ok")).toBe(0);

		expect(dumpRuns()).toBe(1);
		expect(readFileSync(uploadPath, "utf8")).toBe("DUMP-PAYLOAD");
		expect(log()).toContain("✅ backup completed successfully");
		expect(log()).toContain("✅ Upload to S3 completed successfully");
		expect(log()).toContain("Backup done ✅");
	});

	it("reports a failed dump, still dumping only once", () => {
		expect(run("rclone-ok", { dumpFails: true })).not.toBe(0);

		expect(dumpRuns()).toBe(1);
		expect(log()).toContain("❌ Error: Backup failed");
		expect(log()).toContain("server closed the connection");
		expect(log()).not.toContain("✅ backup completed successfully");
	});

	it("removes the partially uploaded object when the dump fails", () => {
		expect(run("rclone-ok", { dumpFails: true })).not.toBe(0);

		expect(existsSync(cleanupMarkPath)).toBe(true);
		expect(existsSync(uploadPath)).toBe(false);
	});

	it("blames the upload, not the dump, when rclone fails", () => {
		expect(run("rclone-fail")).not.toBe(0);

		expect(log()).toContain("❌ Error: Upload to S3 failed");
		expect(log()).not.toContain("❌ Error: Backup failed");
	});

	it("aborts when the container cannot be found", () => {
		write(join(binDir, "docker"), "#!/bin/bash\nexit 0\n");
		try {
			expect(run("rclone-ok")).not.toBe(0);
			expect(dumpRuns()).toBe(0);
			expect(log()).toContain("❌ Error: Container not found");
		} finally {
			write(
				join(binDir, "docker"),
				`#!/bin/bash
if [ "$1" = "ps" ]; then echo "container123"; exit 0; fi
echo run >> "${counterPath}"
printf 'DUMP-PAYLOAD'
if [ -n "$DUMP_FAILS" ]; then echo "pg_dump: server closed the connection" >&2; exit 1; fi
exit 0
`,
			);
		}
	});
});

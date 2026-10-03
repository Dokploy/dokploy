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
import type { Destination } from "@dokploy/server/services/destination";
import { getKeepLatestNBackupsCommand } from "@dokploy/server/utils/backups";
import {
	getBackupFileName,
	getBackupFilePrefix,
} from "@dokploy/server/utils/backups/utils";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Two databases hosted by the same service share one folder in the bucket, so
// retention must only ever delete the files of the database it runs for. The
// command is executed for real against an `rclone` stub that honours --include.
let dir: string;
let binDir: string;
let listingPath: string;
let deletedPath: string;

const destination = {
	bucket: "my-bucket",
	accessKey: "key",
	secretAccessKey: "secret",
	region: "auto",
	endpoint: "https://example.r2.cloudflarestorage.com",
	provider: "Cloudflare",
} as unknown as Destination;

const postgresBackup = (database: string, keepLatestCount: number) =>
	({
		backupType: "database",
		databaseType: "postgres",
		database,
		keepLatestCount,
		prefix: "/",
		destinationId: "destination-id",
		postgres: { appName: "shared-postgres-service" },
	}) as unknown as BackupSchedule;

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), "dokploy-retention-"));
	binDir = join(dir, "bin");
	mkdirSync(binDir);
	listingPath = join(dir, "listing");
	deletedPath = join(dir, "deleted");

	// Minimal rclone: `lsf` prints the listing filtered by the --include glob
	// (rclone's {a,b} alternation translated to bash extglob), `delete` records
	// the path it was asked to remove.
	const stub = join(binDir, "rclone");
	writeFileSync(
		stub,
		`#!/bin/bash
shopt -s extglob
mode="$1"; shift
include=""
target=""
while [ $# -gt 0 ]; do
	case "$1" in
		--include) include="$2"; shift 2;;
		--s3-*) shift;;
		*) target="$1"; shift;;
	esac
done

if [ "$mode" = "lsf" ]; then
	pattern="\${include//\\{/@(}"
	pattern="\${pattern//\\}/)}"
	pattern="\${pattern//,/|}"
	while read -r file; do
		[ -z "$file" ] && continue
		case "$file" in $pattern) echo "$file";; esac
	done < "${listingPath}"
	exit 0
fi

if [ "$mode" = "delete" ]; then
	echo "$target" >> "${deletedPath}"
	exit 0
fi
exit 0
`,
	);
	chmodSync(stub, 0o755);
});

afterAll(() => {
	if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
	if (existsSync(deletedPath)) rmSync(deletedPath);
	// Newest last; both databases live in the same folder.
	writeFileSync(
		listingPath,
		[
			"app-2026-07-20T00-00-00-000Z.sql.gz",
			"app-2026-07-21T00-00-00-000Z.sql.gz",
			"app-2026-07-22T00-00-00-000Z.sql.gz",
			"analytics-2026-07-21T00-00-00-000Z.sql.gz",
			"analytics-2026-07-22T00-00-00-000Z.sql.gz",
			// rclone lsf terminates the last line too
			"",
		].join("\n"),
	);
});

const runRetention = (backup: BackupSchedule) => {
	execSync(getKeepLatestNBackupsCommand(backup, destination), {
		shell: "/bin/bash",
		stdio: "ignore",
		env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
	});

	return existsSync(deletedPath)
		? readFileSync(deletedPath, "utf8")
				.trim()
				.split("\n")
				.filter(Boolean)
				// keep just the file name, the prefix is the same for all of them
				.map((path) => path.split("/").pop() as string)
		: [];
};

describe("getBackupFileName", () => {
	it("carries the database the dump came from", () => {
		expect(getBackupFileName("app", "sql.gz")).toMatch(/^app-.*\.sql\.gz$/);
		expect(getBackupFileName("app", "bson.gz")).toMatch(/^app-.*\.bson\.gz$/);
	});

	it("keeps the prefix safe for an S3 key and for the rclone glob", () => {
		expect(getBackupFilePrefix("my db*{x}")).toBe("my_db__x_-");
	});
});

describe("keepLatestNBackups scoping", () => {
	it("only deletes the files of its own database", () => {
		expect(runRetention(postgresBackup("app", 2))).toEqual([
			"app-2026-07-20T00-00-00-000Z.sql.gz",
		]);
	});

	it("leaves the other database alone even with a smaller keepLatestCount", () => {
		const deleted = runRetention(postgresBackup("analytics", 1));

		expect(deleted).toEqual(["analytics-2026-07-21T00-00-00-000Z.sql.gz"]);
		expect(deleted.some((file) => file.startsWith("app-"))).toBe(false);
	});

	it("deletes nothing when the database has fewer files than keepLatestCount", () => {
		expect(runRetention(postgresBackup("analytics", 5))).toEqual([]);
	});

	it("still matches every backup file of a web server backup", () => {
		const command = getKeepLatestNBackupsCommand(
			{
				backupType: "database",
				databaseType: "web-server",
				database: "dokploy",
				keepLatestCount: 4,
				prefix: "/",
				appName: "web-server-backup",
			} as unknown as BackupSchedule,
			destination,
		);

		expect(command).toContain('--include "*.zip"');
	});
});

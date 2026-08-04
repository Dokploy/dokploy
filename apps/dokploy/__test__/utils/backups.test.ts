import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Destination } from "@dokploy/server/services/destination";
import { keepLatestNBackups } from "@dokploy/server/utils/backups";
import {
	getBackupFileName,
	normalizeS3Path,
	sanitizeBackupCustomName,
} from "@dokploy/server/utils/backups/utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { findDestinationByIdMock } = vi.hoisted(() => ({
	findDestinationByIdMock: vi.fn(),
}));

vi.mock("@dokploy/server/services/destination", () => ({
	findDestinationById: findDestinationByIdMock,
}));

describe("normalizeS3Path", () => {
	test("should handle empty and whitespace-only prefix", () => {
		expect(normalizeS3Path("")).toBe("");
		expect(normalizeS3Path("/")).toBe("");
		expect(normalizeS3Path("  ")).toBe("");
		expect(normalizeS3Path("\t")).toBe("");
		expect(normalizeS3Path("\n")).toBe("");
		expect(normalizeS3Path(" \n \t ")).toBe("");
	});

	test("should trim whitespace from prefix", () => {
		expect(normalizeS3Path(" prefix")).toBe("prefix/");
		expect(normalizeS3Path("prefix ")).toBe("prefix/");
		expect(normalizeS3Path(" prefix ")).toBe("prefix/");
		expect(normalizeS3Path("\tprefix\t")).toBe("prefix/");
		expect(normalizeS3Path(" prefix/nested ")).toBe("prefix/nested/");
	});

	test("should remove leading slashes", () => {
		expect(normalizeS3Path("/prefix")).toBe("prefix/");
		expect(normalizeS3Path("///prefix")).toBe("prefix/");
	});

	test("should remove trailing slashes", () => {
		expect(normalizeS3Path("prefix/")).toBe("prefix/");
		expect(normalizeS3Path("prefix///")).toBe("prefix/");
	});

	test("should remove both leading and trailing slashes", () => {
		expect(normalizeS3Path("/prefix/")).toBe("prefix/");
		expect(normalizeS3Path("///prefix///")).toBe("prefix/");
	});

	test("should handle nested paths", () => {
		expect(normalizeS3Path("prefix/nested")).toBe("prefix/nested/");
		expect(normalizeS3Path("/prefix/nested/")).toBe("prefix/nested/");
		expect(normalizeS3Path("///prefix/nested///")).toBe("prefix/nested/");
	});

	test("should preserve middle slashes", () => {
		expect(normalizeS3Path("prefix/nested/deep")).toBe("prefix/nested/deep/");
		expect(normalizeS3Path("/prefix/nested/deep/")).toBe("prefix/nested/deep/");
	});

	test("should handle special characters", () => {
		expect(normalizeS3Path("prefix-with-dashes")).toBe("prefix-with-dashes/");
		expect(normalizeS3Path("prefix_with_underscores")).toBe(
			"prefix_with_underscores/",
		);
		expect(normalizeS3Path("prefix.with.dots")).toBe("prefix.with.dots/");
	});

	test("should handle the cases from the bug report", () => {
		expect(normalizeS3Path("instance-backups/")).toBe("instance-backups/");
		expect(normalizeS3Path("/instance-backups/")).toBe("instance-backups/");
		expect(normalizeS3Path("instance-backups")).toBe("instance-backups/");
	});
});

describe("sanitizeBackupCustomName", () => {
	test("should return an empty string for empty, null or undefined input", () => {
		expect(sanitizeBackupCustomName("")).toBe("");
		expect(sanitizeBackupCustomName(null)).toBe("");
		expect(sanitizeBackupCustomName(undefined)).toBe("");
	});

	test("should trim whitespace", () => {
		expect(sanitizeBackupCustomName("  my-backup  ")).toBe("my-backup");
	});

	test("should preserve already-safe characters", () => {
		expect(sanitizeBackupCustomName("my-backup_v1.2")).toBe("my-backup_v1.2");
	});

	test("should replace unsafe characters with a hyphen", () => {
		expect(sanitizeBackupCustomName("my backup")).toBe("my-backup");
		expect(sanitizeBackupCustomName("my/backup")).toBe("my-backup");
		expect(sanitizeBackupCustomName("my@backup!")).toBe("my-backup");
		expect(sanitizeBackupCustomName("café ☕")).toBe("caf");
	});

	test("should collapse consecutive unsafe characters into a single hyphen", () => {
		expect(sanitizeBackupCustomName("my   backup")).toBe("my-backup");
		expect(sanitizeBackupCustomName("my///backup")).toBe("my-backup");
	});

	test("should strip leading and trailing hyphens produced by sanitization", () => {
		expect(sanitizeBackupCustomName("/my-backup/")).toBe("my-backup");
		expect(sanitizeBackupCustomName("!!!")).toBe("");
		expect(sanitizeBackupCustomName("   ")).toBe("");
	});
});

describe("getBackupFileName", () => {
	beforeEach(() => {
		// Freeze time so the generated timestamp segment is deterministic.
		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(2026, 7, 4, 3, 27, 47, 369)));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const expectedTimestamp = "2026-08-04T03-27-47-369Z";

	test("should return only the timestamp when there is no custom name or fixed prefix", () => {
		expect(getBackupFileName(undefined, "sql.gz")).toBe(
			`${expectedTimestamp}.sql.gz`,
		);
		expect(getBackupFileName(null, "sql.gz")).toBe(
			`${expectedTimestamp}.sql.gz`,
		);
		expect(getBackupFileName("", "sql.gz")).toBe(`${expectedTimestamp}.sql.gz`);
	});

	test("should prepend the sanitized custom name to the timestamp", () => {
		expect(getBackupFileName("my-backup", "sql.gz")).toBe(
			`my-backup-${expectedTimestamp}.sql.gz`,
		);
		expect(getBackupFileName("My Backup!", "bson.gz")).toBe(
			`My-Backup-${expectedTimestamp}.bson.gz`,
		);
	});

	test("should fall back to the timestamp-only name when the custom name sanitizes to empty", () => {
		expect(getBackupFileName("!!!", "sql.gz")).toBe(
			`${expectedTimestamp}.sql.gz`,
		);
	});

	test("should use the fixed prefix alone when there is no custom name (web-server default)", () => {
		expect(getBackupFileName(undefined, "zip", "webserver-backup")).toBe(
			`webserver-backup-${expectedTimestamp}.zip`,
		);
		expect(getBackupFileName("", "zip", "webserver-backup")).toBe(
			`webserver-backup-${expectedTimestamp}.zip`,
		);
	});

	test("should combine the fixed prefix and the custom name when both are present", () => {
		expect(getBackupFileName("dokploy-local", "zip", "webserver-backup")).toBe(
			`webserver-backup-dokploy-local-${expectedTimestamp}.zip`,
		);
	});
});

describe("keepLatestNBackups", () => {
	// Drives the real, unmodified keepLatestNBackups: no shell fragment is
	// re-typed here, so this can't silently drift from what index.ts runs.
	// The only two externals stubbed are the DB lookup (findDestinationById)
	// and the `rclone` binary itself, via a fake executable put on PATH; the
	// rest of the pipeline (execAsync, sort/tail/cut/xargs) runs for real.
	let stubDir: string;
	let lsfFixtureFile: string;
	let deletedFile: string;
	let originalPath: string | undefined;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	const fakeDestination: Destination = {
		destinationId: "dest-1",
		name: "test-destination",
		provider: null,
		accessKey: "AK",
		secretAccessKey: "SK",
		bucket: "test-bucket",
		region: "us-east-1",
		endpoint: "https://s3.example.com",
		additionalFlags: null,
		organizationId: "org-1",
		serverId: null,
		createdAt: new Date().toISOString(),
	} as unknown as Destination;

	const runKeepLatestNBackups = async (
		keepLatestCount: number,
		lsfLines: string[],
	) => {
		writeFileSync(lsfFixtureFile, `${lsfLines.join("\n")}\n`);
		findDestinationByIdMock.mockResolvedValue(fakeDestination);

		await keepLatestNBackups({
			backupId: "backup-1",
			destinationId: "dest-1",
			prefix: "/",
			appName: "test-app",
			databaseType: "postgres",
			keepLatestCount,
			// biome-ignore lint/suspicious/noExplicitAny: minimal fixture, not the full drizzle relation shape
		} as any);

		expect(consoleErrorSpy).not.toHaveBeenCalled();

		try {
			return readFileSync(deletedFile, "utf-8").trim().split("\n").filter(Boolean);
		} catch {
			return [];
		}
	};

	beforeEach(() => {
		stubDir = mkdtempSync(join(tmpdir(), "rclone-stub-"));
		lsfFixtureFile = join(stubDir, "lsf-fixture.txt");
		deletedFile = join(stubDir, "deleted.txt");

		// A fake `rclone`, close enough to the real CLI to catch a regression
		// in how index.ts calls it:
		// - "lsf" only emits the "<modtime>;<path>" fixture when invoked with
		//   `--format tp` (the real flag rclone needs to produce that shape) —
		//   without it, it emits bare paths, just like the real binary would.
		// - "delete" records the exact path it was asked to remove instead of
		//   touching real S3.
		writeFileSync(
			join(stubDir, "rclone"),
			[
				"#!/bin/bash",
				'if [ "$1" = "lsf" ]; then',
				'  if printf "%s\\n" "$@" | grep -qx "tp"; then',
				`    cat "${lsfFixtureFile}"`,
				"  else",
				`    cut -d';' -f2- "${lsfFixtureFile}"`,
				"  fi",
				'elif [ "$1" = "delete" ]; then',
				`  echo "\${@: -1}" >> "${deletedFile}"`,
				"fi",
			].join("\n"),
			{ mode: 0o755 },
		);

		originalPath = process.env.PATH;
		process.env.PATH = `${stubDir}:${originalPath ?? ""}`;
		findDestinationByIdMock.mockReset();
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		process.env.PATH = originalPath;
		consoleErrorSpy.mockRestore();
		rmSync(stubDir, { recursive: true, force: true });
	});

	// Deliberately mixes a plain timestamp filename with a customName-prefixed
	// one so filename-lexicographic order ("2..." < "dokploy-local-...")
	// disagrees with chronological order — the exact scenario a customName
	// introduces for a pre-existing schedule once it's edited to add/remove/
	// change the custom name.
	const lsfLines = [
		"2026-08-04 03:27:00;2026-08-04T03-27-00-000Z.sql.gz",
		"2026-08-04 03:28:00;dokploy-local-2026-08-04T03-28-00-000Z.sql.gz",
		"2026-08-04 03:29:00;2026-08-04T03-29-00-000Z.sql.gz",
		"2026-08-04 03:30:00;dokploy-local-2026-08-04T03-30-00-000Z.sql.gz",
	];

	test("deletes the chronologically oldest backups, not the lexicographically last ones", async () => {
		const deleted = await runKeepLatestNBackups(2, lsfLines);
		const deletedFilenames = deleted.map(
			(path) => path.split("/").at(-1),
		);

		// A naive filename-only sort would have kept the two files whose names
		// sort last ("dokploy-local-...-03-30" and "dokploy-local-...-03-28")
		// and deleted "...03-27" and "...03-29" instead — deleting the
		// second-*newest* backup. The real, modtime-based pipeline must
		// instead delete exactly the two oldest by time, with a well-formed
		// path (no stray modtime/separator leaking through).
		expect(deletedFilenames.sort()).toEqual(
			[
				"2026-08-04T03-27-00-000Z.sql.gz",
				"dokploy-local-2026-08-04T03-28-00-000Z.sql.gz",
			].sort(),
		);
	});

	test("deletes nothing when keepLatestCount covers the whole list", async () => {
		const deleted = await runKeepLatestNBackups(4, lsfLines);
		expect(deleted).toEqual([]);
	});

	test("does nothing (and never calls rclone) when keepLatestCount is 0", async () => {
		await keepLatestNBackups({
			backupId: "backup-1",
			destinationId: "dest-1",
			prefix: "/",
			appName: "test-app",
			databaseType: "postgres",
			keepLatestCount: 0,
			// biome-ignore lint/suspicious/noExplicitAny: minimal fixture, not the full drizzle relation shape
		} as any);

		expect(findDestinationByIdMock).not.toHaveBeenCalled();
		expect(() => readFileSync(deletedFile, "utf-8")).toThrow();
	});
});

import type { BackupSchedule } from "@dokploy/server/services/backup";
import {
	getBackupCommand,
	getPostgresBackupCommand,
	normalizeS3Path,
} from "@dokploy/server/utils/backups/utils";
import { describe, expect, test } from "vitest";

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

describe("getBackupCommand", () => {
	const backup = {
		backupType: "database",
		databaseType: "postgres",
		database: "mydb",
		postgres: { appName: "my-app", databaseUser: "postgres" },
	} as unknown as BackupSchedule;
	const rcloneCommand =
		'rclone rcat --s3-region=auto ":s3:bucket/my-app/backup.sql.gz"';
	const buildScript = () =>
		getBackupCommand(backup, rcloneCommand, "/tmp/backup.log");

	test("should run the database dump exactly once", () => {
		const script = buildScript();
		const dumpCommand = getPostgresBackupCommand("mydb", "postgres");
		expect(script.split(dumpCommand).length - 1).toBe(1);
	});

	test("should stream the dump directly into rclone", () => {
		expect(buildScript()).toContain(`| ${rcloneCommand}`);
	});

	test("should keep dump and upload failures distinguishable", () => {
		const script = buildScript();
		expect(script).toContain("Error: Backup failed");
		expect(script).toContain("Error: Upload to S3 failed");
	});

	test("should clean up the partial object when a stream fails", () => {
		expect(buildScript()).toContain(
			'rclone deletefile --s3-region=auto ":s3:bucket/my-app/backup.sql.gz"',
		);
	});
});

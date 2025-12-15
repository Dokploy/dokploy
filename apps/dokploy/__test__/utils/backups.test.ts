import {
	getPostgresBackupCommand,
	normalizeS3Path,
	sanitizePgDumpExtraArgs,
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

describe("sanitizePgDumpExtraArgs", () => {
	test("should return empty string for null/undefined/empty input", () => {
		expect(sanitizePgDumpExtraArgs(null)).toBe("");
		expect(sanitizePgDumpExtraArgs(undefined)).toBe("");
		expect(sanitizePgDumpExtraArgs("")).toBe("");
		expect(sanitizePgDumpExtraArgs("   ")).toBe("");
	});

	test("should allow valid pg_dump standalone flags", () => {
		expect(sanitizePgDumpExtraArgs("--inserts")).toBe("--inserts");
		expect(sanitizePgDumpExtraArgs("-s")).toBe("-s");
		expect(sanitizePgDumpExtraArgs("--schema-only")).toBe("--schema-only");
		expect(sanitizePgDumpExtraArgs("--data-only")).toBe("--data-only");
		expect(sanitizePgDumpExtraArgs("--no-comments")).toBe("--no-comments");
	});

	test("should handle --flag=value format", () => {
		expect(sanitizePgDumpExtraArgs("--exclude-table=logs")).toContain(
			"--exclude-table=",
		);
		expect(sanitizePgDumpExtraArgs("--schema=public")).toContain("--schema=");
		expect(sanitizePgDumpExtraArgs("--exclude-extension=timescaledb")).toContain(
			"--exclude-extension=",
		);
	});

	test("should handle --flag value format", () => {
		const result = sanitizePgDumpExtraArgs("--exclude-table logs");
		expect(result).toContain("--exclude-table");
		expect(result).toContain("logs");
	});

	test("should handle short flag value format", () => {
		const result = sanitizePgDumpExtraArgs("-n public");
		expect(result).toContain("-n");
		expect(result).toContain("public");
	});

	test("should reject unknown/dangerous flags", () => {
		expect(sanitizePgDumpExtraArgs("--malicious-flag")).toBe("");
		expect(sanitizePgDumpExtraArgs("--unknown")).toBe("");
	});

	test("should reject command injection attempts", () => {
		// Semicolon injection
		expect(sanitizePgDumpExtraArgs("; rm -rf /")).toBe("");
		// Command substitution
		expect(sanitizePgDumpExtraArgs("$(whoami)")).toBe("");
		// Backtick injection
		expect(sanitizePgDumpExtraArgs("`id`")).toBe("");
		// Pipe injection
		expect(sanitizePgDumpExtraArgs("| cat /etc/passwd")).toBe("");
	});

	test("should escape special characters in values", () => {
		const result = sanitizePgDumpExtraArgs("--exclude-table=test;rm");
		// The value should be escaped (shell-quote escapes with backslash)
		// The semicolon should be escaped so it won't be interpreted as command separator
		expect(result).toContain("\\;");
	});

	test("should handle multiple valid flags", () => {
		const result = sanitizePgDumpExtraArgs("--inserts --no-comments");
		expect(result).toContain("--inserts");
		expect(result).toContain("--no-comments");
	});

	test("should filter out invalid flags while keeping valid ones", () => {
		const result = sanitizePgDumpExtraArgs("--inserts --malicious --data-only");
		expect(result).toContain("--inserts");
		expect(result).toContain("--data-only");
		expect(result).not.toContain("--malicious");
	});
});

describe("getPostgresBackupCommand", () => {
	test("should include extra args in command when provided", () => {
		const cmd = getPostgresBackupCommand("testdb", "postgres", "--inserts");
		expect(cmd).toContain("--inserts");
		expect(cmd).toContain("pg_dump");
		expect(cmd).toContain("testdb");
	});

	test("should work without extra args (null)", () => {
		const cmd = getPostgresBackupCommand("testdb", "postgres", null);
		expect(cmd).toContain("pg_dump -Fc --no-acl --no-owner");
		expect(cmd).not.toContain("undefined");
		expect(cmd).not.toContain("null");
	});

	test("should work without extra args (undefined)", () => {
		const cmd = getPostgresBackupCommand("testdb", "postgres", undefined);
		expect(cmd).toContain("pg_dump -Fc --no-acl --no-owner");
		expect(cmd).not.toContain("undefined");
	});

	test("should work without extra args (empty string)", () => {
		const cmd = getPostgresBackupCommand("testdb", "postgres", "");
		expect(cmd).toContain("pg_dump -Fc --no-acl --no-owner");
		// Should not have double spaces from empty args
		expect(cmd).not.toContain("  ");
	});

	test("should place extra args before database name", () => {
		const cmd = getPostgresBackupCommand(
			"testdb",
			"postgres",
			"--exclude-extension=timescaledb",
		);
		const excludeIndex = cmd.indexOf("--exclude-extension");
		const dbIndex = cmd.indexOf("'testdb'");
		expect(excludeIndex).toBeLessThan(dbIndex);
	});

	test("should sanitize dangerous input in extra args", () => {
		const cmd = getPostgresBackupCommand("testdb", "postgres", "; rm -rf /");
		// Dangerous input should be stripped
		expect(cmd).not.toContain("; rm");
		expect(cmd).not.toContain("rm -rf");
	});
});

import {
	normalizeS3Path,
	validateFileNameFormat,
	formatBackupFileName,
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

describe("validateFileNameFormat", () => {
	test("should return empty array for valid formats", () => {
		expect(validateFileNameFormat("{timestamp}")).toEqual([]);
		expect(validateFileNameFormat("{date}_{time}")).toEqual([]);
		expect(validateFileNameFormat("{appName}-{timestamp}")).toEqual([]);
		expect(validateFileNameFormat("{volumeName}-{date}-{uuid}")).toEqual([]);
	});

	test("should return invalid variables", () => {
		expect(validateFileNameFormat("{invalid}")).toEqual(["invalid"]);
		expect(validateFileNameFormat("{foo}-{bar}")).toEqual(["foo", "bar"]);
		expect(validateFileNameFormat("{timestamp}-{unknown}")).toEqual(["unknown"]);
	});

	test("should handle formats without variables", () => {
		expect(validateFileNameFormat("static-name")).toEqual([]);
		expect(validateFileNameFormat("backup")).toEqual([]);
	});
});

describe("formatBackupFileName", () => {
	test("should replace timestamp variable", () => {
		const result = formatBackupFileName("{timestamp}", {});
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});

	test("should replace date variable", () => {
		const result = formatBackupFileName("{date}", {});
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	test("should replace time variable with safe characters", () => {
		const result = formatBackupFileName("{time}", {});
		expect(result).toMatch(/^\d{2}-\d{2}-\d{2}$/);
	});

	test("should replace context variables", () => {
		const result = formatBackupFileName("{appName}-{volumeName}", {
			appName: "my-app",
			volumeName: "my-volume",
		});
		expect(result).toBe("my-app-my-volume");
	});

	test("should handle missing context variables as empty string", () => {
		const result = formatBackupFileName("{appName}-{volumeName}", {});
		expect(result).toBe("-");
	});

	test("should preserve unknown variables as-is", () => {
		const result = formatBackupFileName("{unknown}", {});
		expect(result).toBe("{unknown}");
	});

	test("should handle mixed static and variable content", () => {
		const result = formatBackupFileName("backup-{appName}-v1", {
			appName: "test",
		});
		expect(result).toBe("backup-test-v1");
	});

	test("should generate unique uuid values", () => {
		const result1 = formatBackupFileName("{uuid}", {});
		const result2 = formatBackupFileName("{uuid}", {});
		expect(result1).not.toBe(result2);
		expect(result1).toMatch(/^[0-9a-f-]{36}$/);
	});

	test("should generate 8-char shortUuid", () => {
		const result = formatBackupFileName("{shortUuid}", {});
		expect(result).toMatch(/^[0-9a-f]{8}$/);
	});

	test("should replace year, month, day variables", () => {
		const result = formatBackupFileName("{year}-{month}-{day}", {});
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	test("should replace hour and minute variables", () => {
		const result = formatBackupFileName("{hour}-{minute}", {});
		expect(result).toMatch(/^\d{2}-\d{2}$/);
	});

	test("should replace epoch variable", () => {
		const result = formatBackupFileName("{epoch}", {});
		expect(result).toMatch(/^\d+$/);
		expect(Number(result)).toBeGreaterThan(1700000000);
	});

	test("should replace databaseType variable", () => {
		const result = formatBackupFileName("{databaseType}", {
			databaseType: "postgres",
		});
		expect(result).toBe("postgres");
	});
});

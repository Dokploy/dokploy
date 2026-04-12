import { normalizePath } from "@dokploy/server/utils/backups/utils";
import { describe, expect, test } from "vitest";

describe("normalizePath", () => {
	test("should handle empty and whitespace-only prefix", () => {
		expect(normalizePath("")).toBe("");
		expect(normalizePath("/")).toBe("");
		expect(normalizePath("  ")).toBe("");
		expect(normalizePath("\t")).toBe("");
		expect(normalizePath("\n")).toBe("");
		expect(normalizePath(" \n \t ")).toBe("");
	});

	test("should trim whitespace from prefix", () => {
		expect(normalizePath(" prefix")).toBe("prefix/");
		expect(normalizePath("prefix ")).toBe("prefix/");
		expect(normalizePath(" prefix ")).toBe("prefix/");
		expect(normalizePath("\tprefix\t")).toBe("prefix/");
		expect(normalizePath(" prefix/nested ")).toBe("prefix/nested/");
	});

	test("should remove leading slashes", () => {
		expect(normalizePath("/prefix")).toBe("prefix/");
		expect(normalizePath("///prefix")).toBe("prefix/");
	});

	test("should remove trailing slashes", () => {
		expect(normalizePath("prefix/")).toBe("prefix/");
		expect(normalizePath("prefix///")).toBe("prefix/");
	});

	test("should remove both leading and trailing slashes", () => {
		expect(normalizePath("/prefix/")).toBe("prefix/");
		expect(normalizePath("///prefix///")).toBe("prefix/");
	});

	test("should handle nested paths", () => {
		expect(normalizePath("prefix/nested")).toBe("prefix/nested/");
		expect(normalizePath("/prefix/nested/")).toBe("prefix/nested/");
		expect(normalizePath("///prefix/nested///")).toBe("prefix/nested/");
	});

	test("should preserve middle slashes", () => {
		expect(normalizePath("prefix/nested/deep")).toBe("prefix/nested/deep/");
		expect(normalizePath("/prefix/nested/deep/")).toBe("prefix/nested/deep/");
	});

	test("should handle special characters", () => {
		expect(normalizePath("prefix-with-dashes")).toBe("prefix-with-dashes/");
		expect(normalizePath("prefix_with_underscores")).toBe(
			"prefix_with_underscores/",
		);
		expect(normalizePath("prefix.with.dots")).toBe("prefix.with.dots/");
	});

	test("should handle the cases from the bug report", () => {
		expect(normalizePath("instance-backups/")).toBe("instance-backups/");
		expect(normalizePath("/instance-backups/")).toBe("instance-backups/");
		expect(normalizePath("instance-backups")).toBe("instance-backups/");
	});
});

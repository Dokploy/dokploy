import { apiCreateLibsql } from "@dokploy/server/db/schema";
import { APP_NAME_MESSAGE } from "@dokploy/server/db/schema/utils";
import { describe, expect, it } from "vitest";

describe("apiCreateLibsql appName", () => {
	const validBase = {
		name: "My libSQL",
		dockerImage: "ghcr.io/tursodatabase/libsql-server:v0.24.32",
		environmentId: "env-1",
		description: null,
		databaseUser: "admin",
		databasePassword: "secretPassword1",
		sqldNode: "primary" as const,
		sqldPrimaryUrl: null,
		enableNamespaces: false,
		serverId: null,
	};

	it.each([
		["a space", "my libsql"],
		["an at sign", "repro@lib"],
		["a slash", "team/libsql"],
		["a colon", "libsql:1"],
	])("refuses an appName with %s", (_, appName) => {
		const result = apiCreateLibsql.safeParse({ ...validBase, appName });
		expect(result.success).toBe(false);
		if (!result.success) {
			const appNameIssues = result.error.issues.filter(
				(issue) => issue.path[0] === "appName",
			);
			expect(appNameIssues.map((issue) => issue.message)).toEqual([
				APP_NAME_MESSAGE,
			]);
		}
	});

	it("accepts an appName of letters, numbers, dots, underscores and hyphens", () => {
		const result = apiCreateLibsql.safeParse({
			...validBase,
			appName: "my-libsql.db_1",
		});
		expect(result.success).toBe(true);
	});

	it("refuses an appName longer than 63 characters", () => {
		const result = apiCreateLibsql.safeParse({
			...validBase,
			appName: "a".repeat(64),
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const appNameIssues = result.error.issues.filter(
				(issue) => issue.path[0] === "appName",
			);
			expect(appNameIssues.map((issue) => issue.code)).toEqual(["too_big"]);
		}
	});

	it("accepts an appName of 63 characters", () => {
		const result = apiCreateLibsql.safeParse({
			...validBase,
			appName: "a".repeat(63),
		});
		expect(result.success).toBe(true);
	});
});

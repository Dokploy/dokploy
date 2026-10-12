import { apiUpdateApplication } from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

describe("apiUpdateApplication superRefine - customCommand validation", () => {
	const applicationId = "app-id";

	it("accepts shell-only change without customCommand", () => {
		const result = apiUpdateApplication.safeParse({
			applicationId,
			customShell: "bash",
		});
		expect(result.success).toBe(true);
	});

	it("rejects customShell value outside sh/bash enum", () => {
		const result = apiUpdateApplication.safeParse({
			applicationId,
			customCommand: "echo ok",
			customShell: "zsh",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const customShellIssue = result.error.issues.find(
				(issue) => issue.path[0] === "customShell",
			);
			expect(customShellIssue).toBeDefined();
		}
	});

	it("rejects whitespace-only customCommand with superRefine Enter a script message", () => {
		const result = apiUpdateApplication.safeParse({
			applicationId,
			customCommand: "   ",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const customCommandIssue = result.error.issues.find(
				(issue) => issue.path[0] === "customCommand" && issue.code === "custom",
			);
			expect(customCommandIssue?.message).toBe("Enter a script");
		}
	});

	it("rejects customCommand with raw 20001 chars via base Zod too_big when trimmed is exactly 20000", () => {
		const result = apiUpdateApplication.safeParse({
			applicationId,
			customCommand: ` ${"a".repeat(20000)}`,
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const tooBigIssue = result.error.issues.find(
				(issue) =>
					issue.path[0] === "customCommand" && issue.code === "too_big",
			);
			expect(tooBigIssue).toBeDefined();
		}
	});

	it("rejects customCommand over 20000 characters via superRefine custom message alongside base Zod max", () => {
		const result = apiUpdateApplication.safeParse({
			applicationId,
			customCommand: "a".repeat(20001),
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const superRefineIssue = result.error.issues.find(
				(issue) =>
					issue.path[0] === "customCommand" &&
					issue.code === "custom" &&
					issue.message === "Script must be 20000 characters or less",
			);
			expect(superRefineIssue).toBeDefined();
		}
	});

	it("accepts null customCommand (superRefine skips null)", () => {
		const result = apiUpdateApplication.safeParse({
			applicationId,
			customCommand: null,
		});
		expect(result.success).toBe(true);
	});

	it("accepts no-op partial update omitting customCommand and customShell", () => {
		const result = apiUpdateApplication.safeParse({
			applicationId,
		});
		expect(result.success).toBe(true);
	});

	it("rejects empty-string customCommand with superRefine Enter a script message", () => {
		const result = apiUpdateApplication.safeParse({
			applicationId,
			customCommand: "",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const customCommandIssue = result.error.issues.find(
				(issue) => issue.path[0] === "customCommand",
			);
			expect(customCommandIssue?.message).toBe("Enter a script");
		}
	});

	it("accepts valid customCommand with valid customShell", () => {
		const result = apiUpdateApplication.safeParse({
			applicationId,
			customCommand: "echo ok",
			customShell: "sh",
		});
		expect(result.success).toBe(true);
	});
});

import { generatePreviewWildcardDomain } from "@dokploy/server/index";
import { describe, expect, it } from "vitest";

const appName = "preview-app-abc123";

describe("generatePreviewWildcardDomain", () => {
	describe("${prNumber} templating", () => {
		it("substitutes ${prNumber} into a deterministic domain (no wildcard)", async () => {
			const domain = await generatePreviewWildcardDomain(
				"pr-${prNumber}.example.com",
				appName,
				"",
				"",
				"42",
			);
			expect(domain).toBe("pr-42.example.com");
		});

		it("replaces every ${prNumber} occurrence", async () => {
			const domain = await generatePreviewWildcardDomain(
				"pr-${prNumber}.env-${prNumber}.example.com",
				appName,
				"",
				"",
				"42",
			);
			expect(domain).toBe("pr-42.env-42.example.com");
		});

		it("combines ${prNumber} with the * wildcard (PR scope + app hash)", async () => {
			const domain = await generatePreviewWildcardDomain(
				"*.pr-${prNumber}.example.com",
				appName,
				"",
				"",
				"42",
			);
			expect(domain).toBe(`${appName}.pr-42.example.com`);
		});

		it("produces distinct domains for two apps sharing a wildcard pattern", async () => {
			const pattern = "*.pr-${prNumber}.example.com";
			const frontend = await generatePreviewWildcardDomain(
				pattern,
				"preview-frontend-aaa",
				"",
				"",
				"7",
			);
			const backend = await generatePreviewWildcardDomain(
				pattern,
				"preview-backend-bbb",
				"",
				"",
				"7",
			);
			expect(frontend).toBe("preview-frontend-aaa.pr-7.example.com");
			expect(backend).toBe("preview-backend-bbb.pr-7.example.com");
			expect(frontend).not.toBe(backend);
		});
	});

	describe("legacy wildcard behavior (backward compatibility)", () => {
		it("substitutes the app hash and slugified IP for *.sslip.io", async () => {
			const domain = await generatePreviewWildcardDomain(
				"*.sslip.io",
				appName,
				"1.2.3.4",
				"",
				"42",
			);
			expect(domain).toBe(`${appName}-1-2-3-4.sslip.io`);
		});

		it("ignores the pull request number when the wildcard has no ${prNumber} token", async () => {
			const domain = await generatePreviewWildcardDomain(
				"*.sslip.io",
				appName,
				"1.2.3.4",
				"",
				"42",
			);
			expect(domain).toBe(`${appName}-1-2-3-4.sslip.io`);
		});

		it("substitutes the app hash for a non-sslip wildcard domain", async () => {
			const domain = await generatePreviewWildcardDomain(
				"*.example.com",
				appName,
				"1.2.3.4",
				"",
				"42",
			);
			expect(domain).toBe(`${appName}.example.com`);
		});
	});

	describe("validation errors", () => {
		it("throws when the domain has neither * nor ${prNumber}", async () => {
			await expect(
				generatePreviewWildcardDomain("static.example.com", appName, "", "", "42"),
			).rejects.toThrow(/must include "\*" or the "\$\{prNumber\}" variable/);
		});

		it("throws when a wildcard domain does not start with *.", async () => {
			await expect(
				generatePreviewWildcardDomain("foo*.example.com", appName, "", "", "42"),
			).rejects.toThrow(/must start with "\*\."/);
		});
	});
});

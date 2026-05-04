import { interpolateSubdomainTemplate } from "../../../../packages/server/src/services/preview-deployment";
import { expect, test } from "vitest";

const baseVars = {
	appName: "my-app",
	prNumber: "123",
	branchName: "feature/login-page",
	uniqueId: "abc123",
};

test("replaces ${prNumber} variable", () => {
	const result = interpolateSubdomainTemplate(
		"${prNumber}.previews.example.com",
		baseVars,
	);
	expect(result).toBe("123.previews.example.com");
});

test("replaces ${branchName} with slugified value", () => {
	const result = interpolateSubdomainTemplate(
		"${branchName}.previews.example.com",
		baseVars,
	);
	expect(result).toBe("feature-login-page.previews.example.com");
});

test("replaces ${appName} variable", () => {
	const result = interpolateSubdomainTemplate(
		"${appName}-${prNumber}.example.com",
		baseVars,
	);
	expect(result).toBe("my-app-123.example.com");
});

test("replaces ${uniqueId} variable", () => {
	const result = interpolateSubdomainTemplate(
		"preview-${uniqueId}.example.com",
		baseVars,
	);
	expect(result).toBe("preview-abc123.example.com");
});

test("replaces all variables in a complex template", () => {
	const result = interpolateSubdomainTemplate(
		"${appName}-pr${prNumber}-${branchName}.example.com",
		baseVars,
	);
	expect(result).toBe("my-app-pr123-feature-login-page.example.com");
});

test("leaves template unchanged when no variables present", () => {
	const result = interpolateSubdomainTemplate(
		"*.traefik.me",
		baseVars,
	);
	expect(result).toBe("*.traefik.me");
});

test("slugifies branch names with special characters", () => {
	const result = interpolateSubdomainTemplate(
		"${branchName}.example.com",
		{ ...baseVars, branchName: "feat/SOME_THING@v2.0" },
	);
	expect(result).toBe("feat-some-thing-v2-0.example.com");
});

test("truncates slugified branch to 63 chars for DNS compliance", () => {
	const longBranch = "a".repeat(100);
	const result = interpolateSubdomainTemplate(
		"${branchName}.example.com",
		{ ...baseVars, branchName: longBranch },
	);
	const subdomain = result.split(".")[0]!;
	expect(subdomain.length).toBeLessThanOrEqual(63);
});

test("handles multiple occurrences of the same variable", () => {
	const result = interpolateSubdomainTemplate(
		"${prNumber}-${prNumber}.example.com",
		baseVars,
	);
	expect(result).toBe("123-123.example.com");
});

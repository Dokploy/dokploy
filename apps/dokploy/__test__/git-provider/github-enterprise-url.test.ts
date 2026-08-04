import {
	DEFAULT_GITHUB_API_URL,
	DEFAULT_GITHUB_URL,
	deriveGithubApiUrl,
	normalizeGithubUrl,
	parseGithubBaseUrl,
} from "@dokploy/server/utils/providers/github";
import { describe, expect, it } from "vitest";

const urlOf = (result: ReturnType<typeof parseGithubBaseUrl>) =>
	"url" in result ? result.url : null;

describe("normalizeGithubUrl", () => {
	it("defaults to github.com when empty", () => {
		expect(normalizeGithubUrl("")).toBe(DEFAULT_GITHUB_URL);
		expect(normalizeGithubUrl(null)).toBe(DEFAULT_GITHUB_URL);
		expect(normalizeGithubUrl(undefined)).toBe(DEFAULT_GITHUB_URL);
		expect(normalizeGithubUrl("   ")).toBe(DEFAULT_GITHUB_URL);
	});

	it("assumes https when no scheme is given", () => {
		expect(normalizeGithubUrl("acme.ghe.com")).toBe("https://acme.ghe.com");
	});

	it("strips paths, queries and trailing slashes", () => {
		expect(normalizeGithubUrl("https://acme.ghe.com/")).toBe(
			"https://acme.ghe.com",
		);
		expect(normalizeGithubUrl("https://acme.ghe.com///")).toBe(
			"https://acme.ghe.com",
		);
		expect(normalizeGithubUrl("https://github.acme.com/some/path?x=1")).toBe(
			"https://github.acme.com",
		);
	});

	it("keeps an explicit port", () => {
		expect(normalizeGithubUrl("https://github.acme.com:8443")).toBe(
			"https://github.acme.com:8443",
		);
	});

	it("falls back to github.com on unusable input", () => {
		expect(normalizeGithubUrl("ftp://github.acme.com")).toBe(
			DEFAULT_GITHUB_URL,
		);
		expect(normalizeGithubUrl("http://github.internal")).toBe(
			DEFAULT_GITHUB_URL,
		);
		expect(normalizeGithubUrl("https://")).toBe(DEFAULT_GITHUB_URL);
	});
});

describe("parseGithubBaseUrl", () => {
	it("accepts github.com and Enterprise hosts", () => {
		expect(urlOf(parseGithubBaseUrl("https://acme.ghe.com"))).toBe(
			"https://acme.ghe.com",
		);
		// A self-hosted instance behind the corporate network is a valid target.
		expect(urlOf(parseGithubBaseUrl("https://github.corp.acme.com"))).toBe(
			"https://github.corp.acme.com",
		);
		expect(urlOf(parseGithubBaseUrl("https://github.acme.com:8443"))).toBe(
			"https://github.acme.com:8443",
		);
	});

	it("treats an absent value as github.com", () => {
		// Not specified is different from specified wrong.
		expect(urlOf(parseGithubBaseUrl(undefined))).toBe(DEFAULT_GITHUB_URL);
		expect(urlOf(parseGithubBaseUrl(null))).toBe(DEFAULT_GITHUB_URL);
		expect(urlOf(parseGithubBaseUrl("  "))).toBe(DEFAULT_GITHUB_URL);
	});

	it("rejects plaintext http", () => {
		expect(parseGithubBaseUrl("http://acme.ghe.com")).toHaveProperty("error");
		expect(parseGithubBaseUrl("http://localhost:2375")).toHaveProperty("error");
	});

	it("rejects dotless hostnames", () => {
		expect(parseGithubBaseUrl("https://metadata")).toHaveProperty("error");
		expect(parseGithubBaseUrl("https://localhost")).toHaveProperty("error");
	});

	it("rejects a dotless hostname hidden behind the DNS root label", () => {
		// "metadata." resolves like "metadata" but the trailing dot would satisfy
		// a naive `includes(".")` check.
		expect(parseGithubBaseUrl("https://metadata.")).toHaveProperty("error");
		expect(parseGithubBaseUrl("https://localhost.")).toHaveProperty("error");
	});

	it("never falls back to github.com on a typo", () => {
		// The symptom that opened the ticket: a provider silently pointing at
		// github.com and reporting that it cannot find the repositories.
		for (const typo of [
			"htps://acme.ghe.com",
			"ftp://acme.ghe.com",
			"https://",
			"acme .ghe.com",
		]) {
			const result = parseGithubBaseUrl(typo);
			expect(result, typo).toHaveProperty("error");
			expect(urlOf(result), typo).not.toBe(DEFAULT_GITHUB_URL);
		}
	});
});

describe("deriveGithubApiUrl", () => {
	it("maps github.com to api.github.com", () => {
		expect(deriveGithubApiUrl("https://github.com")).toBe(
			DEFAULT_GITHUB_API_URL,
		);
		expect(deriveGithubApiUrl("https://www.github.com")).toBe(
			DEFAULT_GITHUB_API_URL,
		);
		expect(deriveGithubApiUrl(undefined)).toBe(DEFAULT_GITHUB_API_URL);
	});

	it("prefixes api. for data residency tenants", () => {
		expect(deriveGithubApiUrl("https://acme.ghe.com")).toBe(
			"https://api.acme.ghe.com",
		);
		expect(deriveGithubApiUrl("americancreditacceptance.ghe.com")).toBe(
			"https://api.americancreditacceptance.ghe.com",
		);
	});

	it("uses /api/v3 for Enterprise Server", () => {
		expect(deriveGithubApiUrl("https://github.acme.com")).toBe(
			"https://github.acme.com/api/v3",
		);
		expect(deriveGithubApiUrl("https://github.acme.com:8443")).toBe(
			"https://github.acme.com:8443/api/v3",
		);
	});

	it("does not treat a lookalike host as data residency", () => {
		// Must not match the .ghe.com branch just because the string contains it.
		expect(deriveGithubApiUrl("https://ghe.com.acme.io")).toBe(
			"https://ghe.com.acme.io/api/v3",
		);
	});

	it("still detects data residency behind the DNS root label", () => {
		// "acme.ghe.com." would otherwise miss endsWith(".ghe.com") and fall
		// through to the /api/v3 branch.
		expect(deriveGithubApiUrl("https://acme.ghe.com.")).toBe(
			"https://api.acme.ghe.com",
		);
	});

	it("maps www.github.com, which a user may well type", () => {
		// Not dead weight: GitHub never redirects a manifest there, but the value
		// comes from a text field. Without this it would derive
		// https://www.github.com/api/v3.
		expect(deriveGithubApiUrl("https://www.github.com")).toBe(
			DEFAULT_GITHUB_API_URL,
		);
	});
});

describe("providers created before Enterprise support", () => {
	it("keeps pointing at github.com", () => {
		// The column defaults to https://github.com, but a null must not break it.
		expect(deriveGithubApiUrl(null)).toBe(DEFAULT_GITHUB_API_URL);
		expect(new URL(normalizeGithubUrl(null)).host).toBe("github.com");
	});
});

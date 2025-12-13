import { generateCustomWildcardDomain } from "@dokploy/server/templates";
import { describe, expect, it } from "vitest";

describe("generateCustomWildcardDomain", () => {
	it("should generate domain with *-suffix pattern", () => {
		const domain = generateCustomWildcardDomain({
			appName: "myapp",
			wildcardDomain: "*-apps.example.com",
		});

		// Should match pattern: myapp-HASH-apps.example.com
		expect(domain).toMatch(/^myapp-[a-f0-9]{6}-apps\.example\.com$/);
	});

	it("should generate domain with *.suffix pattern", () => {
		const domain = generateCustomWildcardDomain({
			appName: "testapp",
			wildcardDomain: "*.apps.example.com",
		});

		// Should match pattern: testapp-HASH.apps.example.com
		expect(domain).toMatch(/^testapp-[a-f0-9]{6}\.apps\.example\.com$/);
	});

	it("should generate domain with simple *.domain pattern", () => {
		const domain = generateCustomWildcardDomain({
			appName: "simple",
			wildcardDomain: "*.example.com",
		});

		// Should match pattern: simple-HASH.example.com
		expect(domain).toMatch(/^simple-[a-f0-9]{6}\.example\.com$/);
	});

	it("should truncate long app names to 40 characters", () => {
		const longAppName =
			"this-is-a-very-long-application-name-that-exceeds-forty-chars";
		const domain = generateCustomWildcardDomain({
			appName: longAppName,
			wildcardDomain: "*.example.com",
		});

		// The truncated app name should be 40 chars
		const truncated = longAppName.substring(0, 40);
		expect(domain).toMatch(
			new RegExp(`^${truncated}-[a-f0-9]{6}\\.example\\.com$`),
		);
	});

	it("should handle domain without wildcard at start", () => {
		const domain = generateCustomWildcardDomain({
			appName: "myapp",
			wildcardDomain: "apps.example.com",
		});

		// Should prepend the replacement
		expect(domain).toMatch(/^myapp-[a-f0-9]{6}\.apps\.example\.com$/);
	});

	it("should handle subdomain wildcards", () => {
		const domain = generateCustomWildcardDomain({
			appName: "myapp",
			wildcardDomain: "*-staging.apps.mydomain.org",
		});

		expect(domain).toMatch(/^myapp-[a-f0-9]{6}-staging\.apps\.mydomain\.org$/);
	});

	it("should generate unique hashes for each call", () => {
		const domain1 = generateCustomWildcardDomain({
			appName: "myapp",
			wildcardDomain: "*.example.com",
		});
		const domain2 = generateCustomWildcardDomain({
			appName: "myapp",
			wildcardDomain: "*.example.com",
		});

		// The domains should have different hashes (very unlikely to be the same)
		expect(domain1).not.toEqual(domain2);
	});

	it("should preserve special characters in wildcard domain", () => {
		const domain = generateCustomWildcardDomain({
			appName: "app",
			wildcardDomain: "*-prod.eu-west-1.example.com",
		});

		expect(domain).toMatch(/^app-[a-f0-9]{6}-prod\.eu-west-1\.example\.com$/);
	});
});

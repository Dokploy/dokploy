import {
	generateTraefikHostRule,
	isWildcardDomain,
} from "@dokploy/server/utils/traefik/host-rule";
import { describe, expect, it } from "vitest";

/**
 * Tests for Traefik host rule generation.
 *
 * Traefik v3 changed the syntax for wildcard routing:
 * - Regular domains use: Host(`domain.com`)
 * - Wildcard domains use: HostRegexp(`^.+\.domain\.com$`)
 *
 * @see https://doc.traefik.io/traefik/v3.0/routing/routers/
 * @see https://community.traefik.io/t/how-to-create-a-router-rule-for-a-wildcard/19850
 */
describe("generateTraefikHostRule", () => {
	describe("regular domains", () => {
		it("should generate Host rule for simple domain", () => {
			const rule = generateTraefikHostRule("example.com");
			expect(rule).toBe("Host(`example.com`)");
		});

		it("should generate Host rule for subdomain", () => {
			const rule = generateTraefikHostRule("app.example.com");
			expect(rule).toBe("Host(`app.example.com`)");
		});

		it("should generate Host rule for deep subdomain", () => {
			const rule = generateTraefikHostRule("api.v1.example.com");
			expect(rule).toBe("Host(`api.v1.example.com`)");
		});

		it("should generate Host rule for localhost", () => {
			const rule = generateTraefikHostRule("localhost");
			expect(rule).toBe("Host(`localhost`)");
		});

		it("should generate Host rule for IP address", () => {
			const rule = generateTraefikHostRule("192.168.1.100");
			expect(rule).toBe("Host(`192.168.1.100`)");
		});

		it("should generate Host rule for hyphenated domain", () => {
			const rule = generateTraefikHostRule("my-app.example-host.com");
			expect(rule).toBe("Host(`my-app.example-host.com`)");
		});
	});

	describe("wildcard domains", () => {
		it("should generate HostRegexp rule for wildcard domain", () => {
			const rule = generateTraefikHostRule("*.example.com");
			expect(rule).toBe("HostRegexp(`^.+\\.example\\.com$`)");
		});

		it("should generate HostRegexp rule for wildcard subdomain", () => {
			const rule = generateTraefikHostRule("*.app.example.com");
			expect(rule).toBe("HostRegexp(`^.+\\.app\\.example\\.com$`)");
		});

		it("should escape dots in base domain for regex", () => {
			const rule = generateTraefikHostRule("*.my.multi.level.domain.com");
			expect(rule).toBe("HostRegexp(`^.+\\.my\\.multi\\.level\\.domain\\.com$`)");
		});

		it("should handle hyphenated wildcard domain", () => {
			const rule = generateTraefikHostRule("*.my-app.example.com");
			expect(rule).toBe("HostRegexp(`^.+\\.my-app\\.example\\.com$`)");
		});
	});

	describe("edge cases", () => {
		it("should not treat domain with asterisk in the middle as wildcard", () => {
			// Only *.domain.com is a wildcard, not a*b.domain.com
			const rule = generateTraefikHostRule("test*.example.com");
			expect(rule).toBe("Host(`test*.example.com`)");
		});

		it("should not treat domain ending with asterisk as wildcard", () => {
			const rule = generateTraefikHostRule("example.com*");
			expect(rule).toBe("Host(`example.com*`)");
		});
	});
});

describe("isWildcardDomain", () => {
	it("should return true for wildcard domain", () => {
		expect(isWildcardDomain("*.example.com")).toBe(true);
	});

	it("should return true for nested wildcard", () => {
		expect(isWildcardDomain("*.app.example.com")).toBe(true);
	});

	it("should return false for regular domain", () => {
		expect(isWildcardDomain("example.com")).toBe(false);
	});

	it("should return false for subdomain", () => {
		expect(isWildcardDomain("app.example.com")).toBe(false);
	});

	it("should return false for domain with asterisk in middle", () => {
		expect(isWildcardDomain("a*b.example.com")).toBe(false);
	});
});

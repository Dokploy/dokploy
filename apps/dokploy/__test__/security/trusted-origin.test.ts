import {
	assertTenantTrustedOriginAllowed,
	filterTenantTrustedOrigins,
} from "@dokploy/server/utils/security/trusted-origin";
import { describe, expect, it } from "vitest";

describe("tenant trusted origin boundary", () => {
	it("allows public HTTPS origins that resolve to public addresses", async () => {
		await expect(
			assertTenantTrustedOriginAllowed("https://tenant.example.com", {
				lookup: async () => [{ address: "8.8.8.8", family: 4 }],
			}),
		).resolves.toBe("https://tenant.example.com");
	});

	it.each([
		["plain http", "http://tenant.example.com"],
		["localhost", "https://localhost"],
		["loopback IPv4", "https://127.0.0.1:3000"],
		["private IPv4", "https://10.0.0.10"],
		["local hostname", "https://idp.local"],
		["path", "https://tenant.example.com/callback"],
		["query", "https://tenant.example.com?issuer=private"],
		["credentials", "https://user:pass@tenant.example.com"],
	])("rejects %s origins", async (_label, origin) => {
		await expect(
			assertTenantTrustedOriginAllowed(origin, {
				lookup: async () => [{ address: "8.8.8.8", family: 4 }],
			}),
		).rejects.toThrow(/Trusted origin/i);
	});

	it("rejects public-looking trusted origins that resolve to private addresses", async () => {
		await expect(
			assertTenantTrustedOriginAllowed("https://tenant.example.com", {
				lookup: async () => [{ address: "10.0.0.10", family: 4 }],
			}),
		).rejects.toThrow(/Trusted origin host/i);
	});

	it("filters legacy tenant origins before they reach Better Auth", async () => {
		await expect(
			filterTenantTrustedOrigins(
				[
					"https://tenant.example.com",
					"https://tenant.example.com/",
					"http://tenant.example.com",
					"https://localhost",
					"https://private.example.com",
					"https://tenant.example.com/callback",
				],
				{
					lookup: async (hostname) => [
						{
							address:
								hostname === "private.example.com" ? "10.0.0.10" : "8.8.8.8",
							family: 4,
						},
					],
				},
			),
		).resolves.toEqual(["https://tenant.example.com"]);
	});
});

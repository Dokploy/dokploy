import { generateRandomDomain } from "@dokploy/server/templates";
import {
	FREE_DOMAIN_PROVIDERS,
	getFreeDomainProvider,
	isFreeDomain,
} from "@dokploy/server/utils/free-domain";
import { describe, expect, it } from "vitest";

describe("free domain providers", () => {
	it("isFreeDomain matches only at the domain boundary", () => {
		expect(isFreeDomain("app-abc-1-2-3-4.sslip.io")).toBe(true);
		expect(isFreeDomain("app-abc-1-2-3-4.traefik.me")).toBe(true);
		expect(isFreeDomain("sslip.io")).toBe(true);
		expect(isFreeDomain("*.traefik.me")).toBe(true);
		expect(isFreeDomain("api.dokploy.com")).toBe(false);
		expect(isFreeDomain("api.traefik.me.example.com")).toBe(false);
		expect(isFreeDomain("nottraefik.me")).toBe(false);
		expect(isFreeDomain(null)).toBe(false);
		expect(isFreeDomain(undefined)).toBe(false);
	});

	it("getFreeDomainProvider returns the matching provider", () => {
		expect(getFreeDomainProvider("app-1-2-3-4.traefik.me")).toBe("traefik.me");
		expect(getFreeDomainProvider("app-1-2-3-4.sslip.io")).toBe("sslip.io");
		expect(getFreeDomainProvider("api.dokploy.com")).toBeUndefined();
	});

	it("generateRandomDomain defaults to sslip.io", () => {
		expect(
			generateRandomDomain({ serverIp: "1.2.3.4", projectName: "app" }),
		).toMatch(/\.sslip\.io$/);
	});

	it("generateRandomDomain honors the chosen provider", () => {
		for (const provider of FREE_DOMAIN_PROVIDERS) {
			const domain = generateRandomDomain({
				serverIp: "1.2.3.4",
				projectName: "app",
				domainProvider: provider,
			});
			expect(domain.endsWith(`-1-2-3-4.${provider}`)).toBe(true);
		}
	});
});

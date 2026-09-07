import { generateRandomDomain } from "@dokploy/server/templates";
import {
	FREE_DOMAIN_PROVIDERS,
	isFreeDomain,
} from "@dokploy/server/utils/free-domain";
import { describe, expect, it } from "vitest";

describe("free domain providers", () => {
	it("isFreeDomain matches every provider and rejects custom domains", () => {
		expect(isFreeDomain("app-abc-1-2-3-4.sslip.io")).toBe(true);
		expect(isFreeDomain("app-abc-1-2-3-4.traefik.me")).toBe(true);
		expect(isFreeDomain("api.dokploy.com")).toBe(false);
		expect(isFreeDomain(null)).toBe(false);
		expect(isFreeDomain(undefined)).toBe(false);
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

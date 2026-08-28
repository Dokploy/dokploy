import type { Domain } from "@dokploy/server";
import { purgeStaleCertificate } from "@dokploy/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stands in for the `domains` lookup that answers "is this host still served
// by another Let's Encrypt domain?".
const hasOtherLetsencryptDomainForHostMock = vi.fn();
vi.mock("@dokploy/server/services/domain", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/services/domain")
	>("@dokploy/server/services/domain");
	return {
		...actual,
		hasOtherLetsencryptDomainForHost: (host: string, excludeId: string) =>
			hasOtherLetsencryptDomainForHostMock(host, excludeId),
	};
});

const purgeAcmeCertificatesMock = vi.fn();
vi.mock("@dokploy/server/utils/traefik/acme", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/traefik/acme")
	>("@dokploy/server/utils/traefik/acme");
	return {
		...actual,
		purgeAcmeCertificates: (hosts: string[], serverId?: string | null) =>
			purgeAcmeCertificatesMock(hosts, serverId),
	};
});

const buildDomain = (overrides: Partial<Domain> = {}): Domain =>
	({
		domainId: "domain-1",
		host: "example.com",
		certificateType: "none",
		applicationId: "app-1",
		uniqueConfigKey: 1,
		...overrides,
	}) as Domain;

describe("purgeStaleCertificate", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	it("purges the host when no other Let's Encrypt domain uses it", async () => {
		hasOtherLetsencryptDomainForHostMock.mockResolvedValue(false);
		purgeAcmeCertificatesMock.mockResolvedValue(["example.com"]);

		const result = await purgeStaleCertificate(buildDomain(), "server-1");

		expect(purgeAcmeCertificatesMock).toHaveBeenCalledWith(
			["example.com"],
			"server-1",
		);
		expect(result).toBe(true);
	});

	it("keeps the host when another Let's Encrypt domain still uses it", async () => {
		hasOtherLetsencryptDomainForHostMock.mockResolvedValue(true);

		const result = await purgeStaleCertificate(buildDomain(), "server-1");

		expect(purgeAcmeCertificatesMock).not.toHaveBeenCalled();
		expect(result).toBe(false);
	});

	it("never purges a domain that still uses Let's Encrypt", async () => {
		const result = await purgeStaleCertificate(
			buildDomain({ certificateType: "letsencrypt" }),
			"server-1",
		);

		expect(hasOtherLetsencryptDomainForHostMock).not.toHaveBeenCalled();
		expect(purgeAcmeCertificatesMock).not.toHaveBeenCalled();
		expect(result).toBe(false);
	});

	it("reports no reload instead of throwing when the purge fails", async () => {
		hasOtherLetsencryptDomainForHostMock.mockResolvedValue(false);
		purgeAcmeCertificatesMock.mockRejectedValue(
			new Error("ssh connection refused"),
		);

		await expect(
			purgeStaleCertificate(buildDomain(), "server-1"),
		).resolves.toBe(false);
	});

	it("reports no reload instead of throwing when the lookup fails", async () => {
		hasOtherLetsencryptDomainForHostMock.mockRejectedValue(
			new Error("database unavailable"),
		);

		await expect(
			purgeStaleCertificate(buildDomain(), "server-1"),
		).resolves.toBe(false);
	});
});

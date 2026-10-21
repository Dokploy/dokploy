import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	createDomain: vi.fn(),
	findDomainById: vi.fn(),
	findDomainsByExternalUpstreamId: vi.fn(),
	findExternalUpstreamById: vi.fn(),
	removeDomainById: vi.fn(),
	updateDomainById: vi.fn(),
	manageExternalUpstreamDomain: vi.fn(),
	audit: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	createDomain: mocks.createDomain,
	findDomainById: mocks.findDomainById,
	findDomainsByExternalUpstreamId: mocks.findDomainsByExternalUpstreamId,
	findExternalUpstreamById: mocks.findExternalUpstreamById,
	removeDomainById: mocks.removeDomainById,
	updateDomainById: mocks.updateDomainById,
	manageExternalUpstreamDomain: mocks.manageExternalUpstreamDomain,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

const { domainRouter } = await import("@/server/api/routers/domain");

const caller = domainRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof domainRouter.createCaller>[0]);

describe("toggling an external upstream domain", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findDomainById
			.mockResolvedValueOnce({
				domainId: "domain-1",
				host: "service.example.com",
				externalUpstreamId: "upstream-1",
				enabled: true,
				domainType: "externalUpstream",
			})
			.mockResolvedValueOnce({
				domainId: "domain-1",
				host: "service.example.com",
				externalUpstreamId: "upstream-1",
				enabled: false,
				domainType: "externalUpstream",
			});
		mocks.findExternalUpstreamById.mockResolvedValue({
			externalUpstreamId: "upstream-1",
			appName: "upstream-1",
			environment: { project: { organizationId: "org-1" } },
		});
		mocks.updateDomainById.mockResolvedValue({ domainId: "domain-1" });
	});

	it("checks service access and applies the disabled state to Traefik", async () => {
		await caller.toggleEnable({ domainId: "domain-1" });

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"upstream-1",
			{ domain: ["create"] },
		);
		expect(mocks.manageExternalUpstreamDomain).toHaveBeenCalledWith(
			expect.objectContaining({
				externalUpstreamId: "upstream-1",
				appName: "upstream-1",
			}),
			expect.objectContaining({ enabled: false }),
		);
	});

	it("checks the associated application even when domainType is omitted", async () => {
		mocks.createDomain.mockResolvedValue({
			domainId: "domain-1",
			host: "service.example.com",
		});

		await caller.create({
			host: "service.example.com",
			customCertResolver: "",
			applicationId: "application-1",
		});

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"application-1",
			{ domain: ["create"] },
		);
	});

	it("rejects upstreams owned by another organization before creating a route", async () => {
		mocks.findExternalUpstreamById.mockResolvedValue({
			externalUpstreamId: "upstream-1",
			environment: { project: { organizationId: "org-2" } },
		});

		await expect(
			caller.create({
				host: "service.example.com",
				customCertResolver: "",
				domainType: "externalUpstream",
				externalUpstreamId: "upstream-1",
			}),
		).rejects.toThrow("You are not authorized to access this external upstream");

		expect(mocks.checkServicePermissionAndAccess).not.toHaveBeenCalled();
		expect(mocks.createDomain).not.toHaveBeenCalled();
	});

	it("rejects cross-organization toggles before changing domain state", async () => {
		mocks.findDomainById.mockReset().mockResolvedValue({
			domainId: "domain-1",
			host: "service.example.com",
			externalUpstreamId: "upstream-1",
			enabled: true,
			domainType: "externalUpstream",
		});
		mocks.findExternalUpstreamById.mockResolvedValue({
			externalUpstreamId: "upstream-1",
			environment: { project: { organizationId: "org-2" } },
		});

		await expect(caller.toggleEnable({ domainId: "domain-1" })).rejects.toThrow(
			"You are not authorized to access this external upstream",
		);

		expect(mocks.checkServicePermissionAndAccess).not.toHaveBeenCalled();
		expect(mocks.updateDomainById).not.toHaveBeenCalled();
		expect(mocks.manageExternalUpstreamDomain).not.toHaveBeenCalled();
	});

	it("rejects cross-organization domain updates before changing the domain", async () => {
		mocks.findDomainById.mockReset().mockResolvedValue({
			domainId: "domain-1",
			externalUpstreamId: "upstream-1",
		});
		mocks.findExternalUpstreamById.mockResolvedValue({
			externalUpstreamId: "upstream-1",
			environment: { project: { organizationId: "org-2" } },
		});

		await expect(
			caller.update({
				domainId: "domain-1",
				host: "new.example.com",
				customCertResolver: "",
			}),
		).rejects.toThrow("You are not authorized to access this external upstream");

		expect(mocks.updateDomainById).not.toHaveBeenCalled();
	});

	it("rejects cross-organization domain deletion before removing the domain", async () => {
		mocks.findDomainById.mockReset().mockResolvedValue({
			domainId: "domain-1",
			externalUpstreamId: "upstream-1",
		});
		mocks.findExternalUpstreamById.mockResolvedValue({
			externalUpstreamId: "upstream-1",
			environment: { project: { organizationId: "org-2" } },
		});

		await expect(caller.delete({ domainId: "domain-1" })).rejects.toThrow(
			"You are not authorized to access this external upstream",
		);

		expect(mocks.removeDomainById).not.toHaveBeenCalled();
	});

	it("rejects cross-organization domain reads", async () => {
		mocks.findDomainById.mockResolvedValue({
			domainId: "domain-1",
			externalUpstreamId: "upstream-1",
		});
		mocks.findExternalUpstreamById.mockResolvedValue({
			externalUpstreamId: "upstream-1",
			environment: { project: { organizationId: "org-2" } },
		});

		await expect(caller.one({ domainId: "domain-1" })).rejects.toThrow(
			"You are not authorized to access this external upstream",
		);
	});
});

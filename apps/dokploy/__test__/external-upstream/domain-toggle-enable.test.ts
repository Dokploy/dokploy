import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	createDomain: vi.fn(),
	findDomainById: vi.fn(),
	findExternalUpstreamById: vi.fn(),
	updateDomainById: vi.fn(),
	manageExternalUpstreamDomain: vi.fn(),
	audit: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	createDomain: mocks.createDomain,
	findDomainById: mocks.findDomainById,
	findExternalUpstreamById: mocks.findExternalUpstreamById,
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
			{ externalUpstreamId: "upstream-1", appName: "upstream-1" },
			expect.objectContaining({ enabled: false }),
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
		).rejects.toThrow(
			"You are not authorized to create a domain for this external upstream",
		);

		expect(mocks.checkServicePermissionAndAccess).not.toHaveBeenCalled();
		expect(mocks.createDomain).not.toHaveBeenCalled();
	});
});

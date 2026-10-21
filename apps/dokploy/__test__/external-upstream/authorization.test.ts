import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServiceAccess: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findEnvironmentById: vi.fn(),
	findExternalUpstreamById: vi.fn(),
	updateExternalUpstreamById: vi.fn(),
	manageExternalUpstreamDomain: vi.fn(),
	removeExternalUpstreamDomain: vi.fn(),
	dbUpdate: vi.fn(),
	audit: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	findEnvironmentById: mocks.findEnvironmentById,
	findExternalUpstreamById: mocks.findExternalUpstreamById,
	updateExternalUpstreamById: mocks.updateExternalUpstreamById,
	manageExternalUpstreamDomain: mocks.manageExternalUpstreamDomain,
	removeExternalUpstreamDomain: mocks.removeExternalUpstreamDomain,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		update: mocks.dbUpdate,
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	addNewService: vi.fn(),
	checkServiceAccess: mocks.checkServiceAccess,
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

const { externalUpstreamRouter } = await import(
	"@/server/api/routers/external-upstream"
);

const caller = externalUpstreamRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "member" },
} as Parameters<typeof externalUpstreamRouter.createCaller>[0]);
const ownerCaller = externalUpstreamRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "owner-1", email: "owner@example.com", role: "owner" },
} as Parameters<typeof externalUpstreamRouter.createCaller>[0]);

describe("moving an external upstream", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkServiceAccess.mockResolvedValue(undefined);
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new Error("You don't have permission to create services"),
		);
		mocks.findExternalUpstreamById.mockResolvedValue({
			externalUpstreamId: "upstream-1",
			appName: "upstream-1",
			environment: { project: { organizationId: "org-1" } },
		});
		mocks.findEnvironmentById.mockResolvedValue({
			project: { projectId: "project-2", organizationId: "org-1" },
		});
		mocks.dbUpdate.mockReturnValue({
			set: () => ({
				where: () => ({
					returning: async () => [{ externalUpstreamId: "upstream-1" }],
				}),
			}),
		});
	});

	it("requires service creation permission before changing its environment", async () => {
		await expect(
			caller.move({
				externalUpstreamId: "upstream-1",
				targetEnvironmentId: "environment-2",
			}),
		).rejects.toThrow("You don't have permission to create services");

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"upstream-1",
			{ service: ["create"] },
		);
		expect(mocks.dbUpdate).not.toHaveBeenCalled();
	});

	it("requires access to the destination project", async () => {
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.checkServiceAccess.mockRejectedValue(
			new Error("You don't have access to this project"),
		);

		await expect(
			caller.move({
				externalUpstreamId: "upstream-1",
				targetEnvironmentId: "environment-2",
			}),
		).rejects.toThrow("You don't have access to this project");

		expect(mocks.checkServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"project-2",
			"create",
		);
		expect(mocks.dbUpdate).not.toHaveBeenCalled();
	});
});

describe("updating an external upstream", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.findExternalUpstreamById.mockResolvedValue({
			externalUpstreamId: "upstream-1",
			appName: "upstream-1",
			environment: { project: { organizationId: "org-2" } },
			domains: [],
		});
	});

	it("rejects an upstream owned by another organization before updating it", async () => {
		await expect(
			ownerCaller.update({
				externalUpstreamId: "upstream-1",
				name: "Changed name",
			}),
		).rejects.toThrow("You are not authorized to update this external upstream");

		expect(mocks.updateExternalUpstreamById).not.toHaveBeenCalled();
	});
});

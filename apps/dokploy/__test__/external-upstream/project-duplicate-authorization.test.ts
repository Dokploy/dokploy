import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkProjectAccess: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findExternalUpstreamById: vi.fn(),
	createProject: vi.fn(),
}));

vi.mock("@dokploy/server/index", () => ({
	findExternalUpstreamById: mocks.findExternalUpstreamById,
	createProject: mocks.createProject,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkProjectAccess: mocks.checkProjectAccess,
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
	addNewProject: vi.fn(),
	findMemberByUserId: vi.fn(),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(),
}));

const { projectRouter } = await import("@/server/api/routers/project");

const ownerCaller = projectRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "owner-1", email: "owner@example.com", role: "owner" },
} as Parameters<typeof projectRouter.createCaller>[0]);

const memberCaller = projectRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "member-1", email: "member@example.com", role: "member" },
} as Parameters<typeof projectRouter.createCaller>[0]);

const duplicateInput = {
	sourceEnvironmentId: "source-environment-1",
	name: "Copied project",
	selectedServices: [{ id: "upstream-1", type: "external-upstream" as const }],
};

describe("project duplication external upstream authorization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkProjectAccess.mockResolvedValue(undefined);
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.findExternalUpstreamById.mockResolvedValue({
			externalUpstreamId: "upstream-1",
			environment: { project: { organizationId: "org-2" } },
		});
	});

	it("rejects a foreign-organization upstream before creating a project", async () => {
		await expect(ownerCaller.duplicate(duplicateInput)).rejects.toThrow(
			"You are not authorized to duplicate this external upstream",
		);

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"upstream-1",
			{ service: ["read"] },
		);
		expect(mocks.createProject).not.toHaveBeenCalled();
	});

	it("rejects upstreams outside a member's service access", async () => {
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new Error("You don't have access to this service"),
		);

		await expect(memberCaller.duplicate(duplicateInput)).rejects.toThrow(
			"You don't have access to this service",
		);

		expect(mocks.findExternalUpstreamById).not.toHaveBeenCalled();
		expect(mocks.createProject).not.toHaveBeenCalled();
	});
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	assertLocalHostAccess: vi.fn(),
	audit: vi.fn(),
	cleanPatchRepos: vi.fn(),
	getAccessibleServerIds: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	cleanPatchRepos: mocks.cleanPatchRepos,
	createPatch: vi.fn(),
	deletePatch: vi.fn(),
	ensurePatchRepo: vi.fn(),
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	findPatchByFilePath: vi.fn(),
	findPatchById: vi.fn(),
	findPatchesByEntityId: vi.fn(),
	getAccessibleServerIds: mocks.getAccessibleServerIds,
	getPatchRepoPath: vi.fn(),
	markPatchForDeletion: vi.fn(),
	readPatchRepoDirectory: vi.fn(),
	readPatchRepoFile: vi.fn(),
	updatePatch: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

vi.mock("@/server/api/utils/local-host-access", () => ({
	assertLocalHostAccess: mocks.assertLocalHostAccess,
}));

const { patchRouter } = await import("../../server/api/routers/patch");

const createCaller = () =>
	patchRouter.createCaller({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "user-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "user-1",
			role: "admin",
		},
	} as never);

describe("patch cleanup router boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.assertLocalHostAccess.mockResolvedValue(undefined);
		mocks.cleanPatchRepos.mockResolvedValue(undefined);
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
	});

	it("rejects inaccessible remote server cleanup before destructive cleanup", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().cleanPatchRepos({ serverId: "server-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.cleanPatchRepos).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("requires local host access before local cleanup", async () => {
		mocks.assertLocalHostAccess.mockRejectedValue(new Error("denied"));

		await expect(createCaller().cleanPatchRepos({})).rejects.toThrow("denied");

		expect(mocks.assertLocalHostAccess).toHaveBeenCalledWith(
			expect.objectContaining({
				session: expect.objectContaining({
					activeOrganizationId: "org-1",
				}),
				user: expect.objectContaining({
					id: "user-1",
				}),
			}),
		);
		expect(mocks.cleanPatchRepos).not.toHaveBeenCalled();
	});

	it("allows cleanup only after remote server access is approved", async () => {
		await expect(
			createCaller().cleanPatchRepos({ serverId: "server-1" }),
		).resolves.toBe(true);

		expect(mocks.cleanPatchRepos).toHaveBeenCalledWith("server-1");
		expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), {
			action: "delete",
			resourceType: "settings",
			resourceId: "server-1",
			metadata: { type: "cleanPatchRepos" },
		});
	});
});

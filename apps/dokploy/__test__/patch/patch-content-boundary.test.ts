import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	findPatchByFilePath: vi.fn(),
	findPatchById: vi.fn(),
	findPatchesByEntityId: vi.fn(),
	getPatchRepoPath: vi.fn(),
	readPatchRepoDirectory: vi.fn(),
	readPatchRepoFile: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	cleanPatchRepos: vi.fn(),
	createPatch: vi.fn(),
	deletePatch: vi.fn(),
	ensurePatchRepo: vi.fn(),
	findApplicationById: mocks.findApplicationById,
	findComposeById: mocks.findComposeById,
	findPatchByFilePath: mocks.findPatchByFilePath,
	findPatchById: mocks.findPatchById,
	findPatchesByEntityId: mocks.findPatchesByEntityId,
	getAccessibleServerIds: vi.fn(),
	getPatchRepoPath: mocks.getPatchRepoPath,
	markPatchForDeletion: vi.fn(),
	readPatchRepoDirectory: mocks.readPatchRepoDirectory,
	readPatchRepoFile: mocks.readPatchRepoFile,
	updatePatch: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(),
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
			role: "member",
		},
	} as never);

describe("patch content boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.findPatchById.mockResolvedValue({
			patchId: "patch-1",
			applicationId: "app-1",
			composeId: null,
			filePath: "src/config.ts",
			content: "SECRET_PATCH=1",
			type: "update",
		});
		mocks.findPatchesByEntityId.mockResolvedValue([
			{
				patchId: "patch-1",
				applicationId: "app-1",
				composeId: null,
				filePath: "src/config.ts",
				content: "SECRET_PATCH=1",
				type: "update",
			},
		]);
		mocks.findApplicationById.mockResolvedValue({ serverId: "server-1" });
		mocks.findComposeById.mockResolvedValue({ serverId: "server-1" });
		mocks.findPatchByFilePath.mockResolvedValue(null);
		mocks.getPatchRepoPath.mockResolvedValue("/tmp/repo");
		mocks.readPatchRepoDirectory.mockResolvedValue([
			{ name: "src", path: "src", type: "directory" },
		]);
		mocks.readPatchRepoFile.mockResolvedValue("file contents");
	});

	it("redacts stored patch content from service.read list responses", async () => {
		await expect(
			createCaller().byEntityId({ id: "app-1", type: "application" }),
		).resolves.toEqual([
			expect.objectContaining({
				content: "__DOKPLOY_REDACTED_SECRET__",
				filePath: "src/config.ts",
			}),
		]);

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ service: ["read"] },
		);
	});

	it("requires service.create before returning stored patch content", async () => {
		await expect(
			createCaller().one({ patchId: "patch-1" }),
		).resolves.toMatchObject({
			content: "SECRET_PATCH=1",
		});

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ service: ["create"] },
		);
	});

	it("denies repository file browsing before file reads without service.create", async () => {
		mocks.checkServicePermissionAndAccess.mockRejectedValueOnce(
			new Error("service create denied"),
		);

		await expect(
			createCaller().readRepoFile({
				id: "app-1",
				type: "application",
				filePath: "src/config.ts",
			}),
		).rejects.toThrow("service create denied");

		expect(mocks.findApplicationById).not.toHaveBeenCalled();
		expect(mocks.readPatchRepoFile).not.toHaveBeenCalled();
	});

	it("denies repository directory browsing before listing without service.create", async () => {
		mocks.checkServicePermissionAndAccess.mockRejectedValueOnce(
			new Error("service create denied"),
		);

		await expect(
			createCaller().readRepoDirectories({
				id: "app-1",
				type: "application",
				repoPath: "src",
			}),
		).rejects.toThrow("service create denied");

		expect(mocks.findApplicationById).not.toHaveBeenCalled();
		expect(mocks.readPatchRepoDirectory).not.toHaveBeenCalled();
	});
});

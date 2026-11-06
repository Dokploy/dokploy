import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findMountById: vi.fn(),
	readFileMountContent: vi.fn(),
	updateMount: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	createMount: vi.fn(),
	deleteMount: vi.fn(),
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	findLibsqlById: vi.fn(),
	findMariadbById: vi.fn(),
	findMongoById: vi.fn(),
	findMountById: mocks.findMountById,
	findMountsByApplicationId: vi.fn(),
	findMySqlById: vi.fn(),
	findPostgresById: vi.fn(),
	findRedisById: vi.fn(),
	getServiceContainer: vi.fn(),
	readFileMountContent: mocks.readFileMountContent,
	updateMount: mocks.updateMount,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServiceAccess: vi.fn(async () => undefined),
	checkServicePermissionAndAccess: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const { mountRouter } = await import("@/server/api/routers/mount");

const caller = mountRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof mountRouter.createCaller>[0]);

const save = (expectedContent?: string | null) =>
	caller.update({
		mountId: "mount-1",
		type: "file",
		content: "FOO=edited\n",
		expectedContent,
	});

describe("mounts.update for file mounts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findMountById.mockResolvedValue({
			mountId: "mount-1",
			type: "file",
			composeId: "compose-1",
		});
	});

	it("refuses to overwrite a file that changed on disk after the editor loaded it", async () => {
		mocks.readFileMountContent.mockResolvedValue("FOO=1\nBAR=from-app\n");

		await expect(save("FOO=1\n")).rejects.toMatchObject({ code: "CONFLICT" });
		expect(mocks.updateMount).not.toHaveBeenCalled();
	});

	it("saves when the file on disk is unchanged", async () => {
		mocks.readFileMountContent.mockResolvedValue("FOO=1\n");

		await save("FOO=1\n");

		const saved = mocks.updateMount.mock.calls[0]?.[1];
		expect(saved).toMatchObject({ content: "FOO=edited\n" });
		expect(saved).not.toHaveProperty("expectedContent");
	});

	it("saves when the file still doesn't exist", async () => {
		mocks.readFileMountContent.mockResolvedValue(null);

		await save(null);

		expect(mocks.updateMount).toHaveBeenCalledOnce();
	});

	it("skips the check when expectedContent isn't sent", async () => {
		await save();

		expect(mocks.readFileMountContent).not.toHaveBeenCalled();
		expect(mocks.updateMount).toHaveBeenCalledOnce();
	});
});

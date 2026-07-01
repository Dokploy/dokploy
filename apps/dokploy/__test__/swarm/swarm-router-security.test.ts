import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	assertLocalHostAccess: vi.fn(),
	checkPermission: vi.fn(),
	findServerById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getAllContainerStats: vi.fn(),
	getApplicationInfo: vi.fn(),
	getNodeApplications: vi.fn(),
	getNodeInfo: vi.fn(),
	getSwarmNodes: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	findServerById: mocks.findServerById,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
	getAllContainerStats: mocks.getAllContainerStats,
	getApplicationInfo: mocks.getApplicationInfo,
	getNodeApplications: mocks.getNodeApplications,
	getNodeInfo: mocks.getNodeInfo,
	getSwarmNodes: mocks.getSwarmNodes,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
}));

vi.mock("@/server/api/utils/local-host-access", () => ({
	assertLocalHostAccess: mocks.assertLocalHostAccess,
}));

const { swarmRouter } = await import("../../server/api/routers/swarm");

const createCaller = () =>
	swarmRouter.createCaller({
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

describe("swarm router server boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.assertLocalHostAccess.mockResolvedValue(undefined);
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
		mocks.getNodeInfo.mockResolvedValue({ ID: "node-1" });
		mocks.getSwarmNodes.mockResolvedValue([]);
	});

	it("denies inaccessible server node info before swarm service calls", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().getNodeInfo({
				nodeId: "node-1",
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.getNodeInfo).not.toHaveBeenCalled();
		expect(mocks.findServerById).not.toHaveBeenCalled();
	});

	it("allows accessible server node info", async () => {
		await expect(
			createCaller().getNodeInfo({
				nodeId: "node-1",
				serverId: "server-1",
			}),
		).resolves.toEqual({ ID: "node-1" });

		expect(mocks.getNodeInfo).toHaveBeenCalledWith("node-1", "server-1");
	});

	it("applies the same server boundary to swarm node listings", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().getNodes({ serverId: "server-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.getSwarmNodes).not.toHaveBeenCalled();
	});

	it("denies local swarm node listings without local host access", async () => {
		mocks.assertLocalHostAccess.mockRejectedValue(new Error("denied"));

		await expect(createCaller().getNodes({})).rejects.toThrow("denied");

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
		expect(mocks.getSwarmNodes).not.toHaveBeenCalled();
	});

	it("allows local swarm node listings after local host access is approved", async () => {
		await expect(createCaller().getNodes({})).resolves.toEqual([]);

		expect(mocks.assertLocalHostAccess).toHaveBeenCalled();
		expect(mocks.getSwarmNodes).toHaveBeenCalledWith(undefined);
	});
});

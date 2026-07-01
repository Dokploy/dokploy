import { beforeEach, describe, expect, it, vi } from "vitest";

const dockerClient = {
	info: vi.fn(),
	listNodes: vi.fn(),
	swarmInspect: vi.fn(),
	version: vi.fn(),
};

const mocks = vi.hoisted(() => ({
	assertLocalHostAccess: vi.fn(),
	audit: vi.fn(),
	checkPermission: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	findServerById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getLocalServerIp: vi.fn(),
	getRemoteDocker: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
	findServerById: mocks.findServerById,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
	getRemoteDocker: mocks.getRemoteDocker,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

vi.mock("@/server/api/utils/local-host-access", () => ({
	assertLocalHostAccess: mocks.assertLocalHostAccess,
}));

vi.mock("@/server/wss/terminal", () => ({
	getLocalServerIp: mocks.getLocalServerIp,
}));

const { clusterRouter } = await import("../../server/api/routers/cluster");

const createCaller = () =>
	clusterRouter.createCaller({
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

describe("cluster router assigned-server boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.assertLocalHostAccess.mockResolvedValue(undefined);
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			organizationId: "org-1",
			ipAddress: "203.0.113.10",
		});
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
		mocks.getLocalServerIp.mockResolvedValue("127.0.0.1");
		mocks.getRemoteDocker.mockResolvedValue(dockerClient);
		dockerClient.info.mockResolvedValue({ Swarm: { NodeAddr: "10.0.0.10" } });
		dockerClient.listNodes.mockResolvedValue([{ ID: "node-1" }]);
		dockerClient.swarmInspect.mockResolvedValue({
			JoinTokens: {
				Manager: "manager-token",
				Worker: "worker-token",
			},
		});
		dockerClient.version.mockResolvedValue({ Version: "25.0.0" });
	});

	it("denies inaccessible server node listings before Docker client access", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().getNodes({ serverId: "server-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.getRemoteDocker).not.toHaveBeenCalled();
		expect(dockerClient.listNodes).not.toHaveBeenCalled();
	});

	it("denies inaccessible worker removal before remote Docker commands", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().removeWorker({
				nodeId: "node-1",
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("denies local worker removal before Docker commands when local host access is denied", async () => {
		mocks.assertLocalHostAccess.mockRejectedValue(new Error("denied"));

		await expect(
			createCaller().removeWorker({
				nodeId: "node-1",
			}),
		).rejects.toThrow("denied");

		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("rejects unsafe node identifiers before Docker commands", async () => {
		await expect(
			createCaller().removeWorker({
				nodeId: "node-1;id",
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("uses normalized node identifiers in worker removal commands", async () => {
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });

		await expect(
			createCaller().removeWorker({
				nodeId: " node.name-1 ",
				serverId: "server-1",
			}),
		).resolves.toBe(true);

		expect(mocks.execAsyncRemote).toHaveBeenNthCalledWith(
			1,
			"server-1",
			"docker node update --availability drain node.name-1",
		);
		expect(mocks.execAsyncRemote).toHaveBeenNthCalledWith(
			2,
			"server-1",
			"docker node rm node.name-1 --force",
		);
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				resourceId: "node.name-1",
				resourceName: "node.name-1",
			}),
		);
	});

	it("denies inaccessible manager join token reads before swarm inspect", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().addManager({ serverId: "server-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.getRemoteDocker).not.toHaveBeenCalled();
		expect(dockerClient.swarmInspect).not.toHaveBeenCalled();
		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			server: ["execute"],
		});
	});

	it("allows accessible worker join token reads", async () => {
		await expect(
			createCaller().addWorker({ serverId: "server-1" }),
		).resolves.toEqual({
			command: "docker swarm join --token worker-token 10.0.0.10:2377",
			version: "25.0.0",
		});

		expect(mocks.getAccessibleServerIds).toHaveBeenCalledWith({
			userId: "user-1",
			activeOrganizationId: "org-1",
		});
		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			server: ["execute"],
		});
		expect(mocks.getRemoteDocker).toHaveBeenCalledWith("server-1");
	});
});

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	assertLocalDockerContainerAccess: vi.fn(),
	assertLocalDockerServiceAccess: vi.fn(),
	assertLocalDockerServiceReadAccess: vi.fn(),
	checkPermission: vi.fn(),
	containerKill: vi.fn(),
	containerRemove: vi.fn(),
	containerRestart: vi.fn(),
	containerStart: vi.fn(),
	containerStop: vi.fn(),
	findMemberByUserId: vi.fn(),
	findServerById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getConfig: vi.fn(),
	getContainers: vi.fn(),
	getContainersByAppLabel: vi.fn(),
	getContainersByAppNameMatch: vi.fn(),
	getServiceContainersByAppName: vi.fn(),
	getStackContainersByAppName: vi.fn(),
	uploadFileToContainer: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	containerKill: mocks.containerKill,
	containerRemove: mocks.containerRemove,
	containerRestart: mocks.containerRestart,
	containerStart: mocks.containerStart,
	containerStop: mocks.containerStop,
	findServerById: mocks.findServerById,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
	getConfig: mocks.getConfig,
	getContainers: mocks.getContainers,
	getContainersByAppLabel: mocks.getContainersByAppLabel,
	getContainersByAppNameMatch: mocks.getContainersByAppNameMatch,
	getServiceContainersByAppName: mocks.getServiceContainersByAppName,
	getStackContainersByAppName: mocks.getStackContainersByAppName,
	uploadFileToContainer: mocks.uploadFileToContainer,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
	findMemberByUserId: mocks.findMemberByUserId,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

vi.mock("@/server/api/utils/local-docker-access", () => ({
	assertLocalDockerContainerAccess: mocks.assertLocalDockerContainerAccess,
	assertLocalDockerServiceAccess: mocks.assertLocalDockerServiceAccess,
	assertLocalDockerServiceReadAccess: mocks.assertLocalDockerServiceReadAccess,
}));

const { dockerRouter } = await import("../../server/api/routers/docker");

const createCaller = () =>
	dockerRouter.createCaller({
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

describe("docker router assigned-server boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.findMemberByUserId.mockResolvedValue({ role: "admin" });
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			organizationId: "org-1",
		});
		mocks.assertLocalDockerContainerAccess.mockResolvedValue({
			Id: "container-1",
			Config: {
				Labels: {
					"com.docker.swarm.service.name": "app-1",
				},
			},
		});
		mocks.assertLocalDockerServiceAccess.mockResolvedValue(undefined);
		mocks.assertLocalDockerServiceReadAccess.mockResolvedValue(undefined);
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
		mocks.getContainers.mockResolvedValue([{ Id: "container-1" }]);
		mocks.getContainersByAppNameMatch.mockResolvedValue([
			{ Id: "container-1" },
		]);
		mocks.getServiceContainersByAppName.mockResolvedValue([
			{ ID: "container-1" },
		]);
		mocks.containerRestart.mockResolvedValue(undefined);
	});

	it("denies inaccessible server container listings before Docker service access", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().getContainers({ serverId: "server-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.getContainers).not.toHaveBeenCalled();
	});

	it("denies inaccessible server container mutations before side effects", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().restartContainer({
				containerId: "container-1",
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.containerRestart).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("allows accessible server container listings", async () => {
		await expect(
			createCaller().getContainers({ serverId: "server-1" }),
		).resolves.toEqual([{ Id: "container-1" }]);

		expect(mocks.getAccessibleServerIds).toHaveBeenCalledWith({
			userId: "user-1",
			activeOrganizationId: "org-1",
		});
		expect(mocks.getContainers).toHaveBeenCalledWith("server-1");
	});

	it("denies non-admin docker host operations before Docker service access", async () => {
		mocks.findMemberByUserId.mockResolvedValue({ role: "member" });

		await expect(
			createCaller().getContainers({ serverId: "server-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
		expect(mocks.getContainers).not.toHaveBeenCalled();
	});

	it("binds local container mutations to an authorized service before side effects", async () => {
		await expect(
			createCaller().restartContainer({
				containerId: "container-1",
			}),
		).resolves.toBeUndefined();

		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
		expect(mocks.assertLocalDockerContainerAccess).toHaveBeenCalledWith(
			expect.anything(),
			"container-1",
			"execute",
		);
		expect(mocks.containerRestart).toHaveBeenCalledWith(
			"container-1",
			undefined,
		);
	});

	it("denies unbound local container mutations before side effects", async () => {
		mocks.assertLocalDockerContainerAccess.mockRejectedValue(
			new TRPCError({ code: "UNAUTHORIZED" }),
		);

		await expect(
			createCaller().restartContainer({
				containerId: "container-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.containerRestart).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("requires docker.execute for container lifecycle actions", async () => {
		mocks.findMemberByUserId.mockResolvedValue({ role: "member" });
		const caller = createCaller();

		await caller.restartContainer({ containerId: "container-1" });
		await caller.startContainer({ containerId: "container-1" });
		await caller.stopContainer({ containerId: "container-1" });
		await caller.killContainer({ containerId: "container-1" });

		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			docker: ["execute"],
		});
		expect(
			mocks.checkPermission.mock.calls.filter(
				([, permissions]) =>
					JSON.stringify(permissions) === JSON.stringify({ docker: ["read"] }),
			),
		).toHaveLength(0);
		expect(mocks.findMemberByUserId).not.toHaveBeenCalled();
		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
	});

	it("requires docker.delete for container removal", async () => {
		mocks.findMemberByUserId.mockResolvedValue({ role: "member" });

		await createCaller().removeContainer({ containerId: "container-1" });

		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			docker: ["delete"],
		});
		expect(mocks.findMemberByUserId).not.toHaveBeenCalled();
		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
	});

	it("requires docker.inspect for container config inspection", async () => {
		mocks.findMemberByUserId.mockResolvedValue({ role: "member" });
		mocks.getConfig.mockResolvedValue({ Config: { Env: ["SECRET=value"] } });

		await createCaller().getConfig({ containerId: "container-1" });

		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			docker: ["inspect"],
		});
		expect(mocks.assertLocalDockerContainerAccess).toHaveBeenCalledWith(
			expect.anything(),
			"container-1",
			"inspect",
		);
		expect(mocks.getConfig).not.toHaveBeenCalled();
		expect(mocks.findMemberByUserId).not.toHaveBeenCalled();
		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
	});

	it("requires docker.write for container file uploads", async () => {
		mocks.findMemberByUserId.mockResolvedValue({ role: "member" });
		const file = new File(["content"], "config.txt", { type: "text/plain" });

		await createCaller().uploadFileToContainer({
			containerId: "container-1",
			file,
			destinationPath: "/tmp/config.txt",
		});

		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			docker: ["write"],
		});
		expect(mocks.assertLocalDockerContainerAccess).toHaveBeenCalledWith(
			expect.anything(),
			"container-1",
			"write",
		);
		expect(mocks.uploadFileToContainer).toHaveBeenCalledWith(
			"container-1",
			expect.any(Buffer),
			"config.txt",
			"/tmp/config.txt",
			null,
		);
		expect(mocks.findMemberByUserId).not.toHaveBeenCalled();
		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
	});

	it("allows service-scoped local app-name container listings without Docker host access", async () => {
		mocks.findMemberByUserId.mockResolvedValue({ role: "member" });

		await expect(
			createCaller().getContainersByAppNameMatch({ appName: "app-1" }),
		).resolves.toEqual([{ Id: "container-1" }]);

		expect(mocks.findMemberByUserId).not.toHaveBeenCalled();
		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
		expect(mocks.assertLocalDockerServiceReadAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
		);
		expect(mocks.getContainersByAppNameMatch).toHaveBeenCalledWith(
			"app-1",
			undefined,
			undefined,
		);
	});

	it("uses docker.read service binding for local app-name Docker routes", async () => {
		mocks.findMemberByUserId.mockResolvedValue({ role: "member" });

		await expect(
			createCaller().getServiceContainersByAppName({ appName: "app-1" }),
		).resolves.toEqual([{ ID: "container-1" }]);

		expect(mocks.findMemberByUserId).not.toHaveBeenCalled();
		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
		expect(mocks.assertLocalDockerServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			"read",
		);
		expect(mocks.getServiceContainersByAppName).toHaveBeenCalledWith(
			"app-1",
			undefined,
		);
	});

	it("keeps remote app-name container routes behind Docker server access", async () => {
		mocks.findMemberByUserId.mockResolvedValue({ role: "member" });

		await expect(
			createCaller().getContainersByAppNameMatch({
				appName: "app-1",
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.assertLocalDockerServiceReadAccess).not.toHaveBeenCalled();
		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
		expect(mocks.getContainersByAppNameMatch).not.toHaveBeenCalled();
	});
});

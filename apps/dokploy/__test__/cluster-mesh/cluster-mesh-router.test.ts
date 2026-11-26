import { db } from "@dokploy/server/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkPermission: vi.fn(),
	findServerById: vi.fn(),
	findSSHKeyById: vi.fn(),
	findMesh: vi.fn(),
	findMeshBySwarm: vi.fn(),
	enableClusterMesh: vi.fn(),
	addClusterNode: vi.fn(),
	setClusterNodeAvailability: vi.fn(),
	findClusterPreflightIssues: vi.fn(),
	removeClusterNode: vi.fn(),
	setSwarmNodePool: vi.fn(),
	audit: vi.fn(),
	isCloud: false,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
	checkServicePermissionAndAccess: vi.fn(),
}));

vi.mock("@dokploy/server/index", async () => {
	const provision = await vi.importActual<
		typeof import("@dokploy/server/services/cluster-mesh/provision")
	>("@dokploy/server/services/cluster-mesh/provision");
	return {
		ClusterMeshError: provision.ClusterMeshError,
		findServerById: mocks.findServerById,
		findSSHKeyById: mocks.findSSHKeyById,
		findMesh: mocks.findMesh,
		findMeshBySwarm: mocks.findMeshBySwarm,
		enableClusterMesh: mocks.enableClusterMesh,
		addClusterNode: mocks.addClusterNode,
		setClusterNodeAvailability: mocks.setClusterNodeAvailability,
		findClusterPreflightIssues: mocks.findClusterPreflightIssues,
		removeClusterNode: mocks.removeClusterNode,
		setSwarmNodePool: mocks.setSwarmNodePool,
		listSwarmPools: vi.fn(async () => ["eu"]),
		POOL_LABEL: "dokploy.pool",
		getRemoteDocker: vi.fn(async () => ({ listNodes: async () => [] })),
		getWebServerSettings: vi.fn(async () => ({ serverIp: "203.0.113.1" })),
		get IS_CLOUD() {
			return mocks.isCloud;
		},
	};
});

vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));
vi.mock("@/server/utils/docker", () => ({
	getDockerHost: vi.fn(async () => "172.17.0.1"),
}));

const { clusterMeshRouter } = await import("@/server/api/routers/cluster-mesh");

const caller = clusterMeshRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "owner@example.com", role: "owner" },
} as Parameters<typeof clusterMeshRouter.createCaller>[0]);

const manager = {
	sshAddress: "203.0.113.1",
	sshPort: 22,
	sshUser: "root",
	sshKeyId: "key-1",
	endpointAddress: "203.0.113.1",
};

const nodeRow = (organizationId = "org-1") => ({
	clusterNodeId: "n1",
	name: "worker-1",
	mesh: { meshId: "m1", serverId: null, organizationId },
});

describe("clusterMesh router", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) {
			if (typeof mock === "function") mock.mockReset();
		}
		mocks.isCloud = false;
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.findSSHKeyById.mockResolvedValue({ organizationId: "org-1" });
		mocks.findServerById.mockResolvedValue({ organizationId: "org-1" });
		mocks.enableClusterMesh.mockResolvedValue({
			meshId: "m1",
			subnet: "100.96.0.0/24",
		});
	});

	it("needs server permission to set up networking and passes the caller's organization", async () => {
		await caller.enable({ manager, subnet: "100.96.0.0/24" });

		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			server: ["create"],
		});
		expect(mocks.enableClusterMesh).toHaveBeenCalledWith({
			organizationId: "org-1",
			serverId: null,
			subnet: "100.96.0.0/24",
			listenPort: 51820,
			manager,
		});
		expect(mocks.audit).toHaveBeenCalled();
	});

	it("passes a chosen tunnel port and refuses one outside 1024-65535", async () => {
		await caller.enable({
			manager,
			subnet: "100.96.0.0/24",
			listenPort: 41820,
		});
		expect(mocks.enableClusterMesh).toHaveBeenCalledWith(
			expect.objectContaining({ listenPort: 41820 }),
		);

		for (const listenPort of [53, 70000, 41820.5]) {
			await expect(
				caller.enable({ manager, subnet: "100.96.0.0/24", listenPort }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
	});

	it("refuses another organization's SSH key or server", async () => {
		mocks.findSSHKeyById.mockResolvedValue({ organizationId: "org-2" });
		await expect(
			caller.enable({ manager, subnet: "100.96.0.0/24" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		mocks.findSSHKeyById.mockResolvedValue({ organizationId: "org-1" });
		mocks.findServerById.mockResolvedValue({ organizationId: "org-2" });
		await expect(
			caller.enable({ serverId: "s1", manager, subnet: "100.96.0.0/24" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mocks.enableClusterMesh).not.toHaveBeenCalled();
	});

	it("is not offered on Dokploy Cloud", async () => {
		mocks.isCloud = true;
		await expect(
			caller.enable({ manager, subnet: "100.96.0.0/24" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	it("rejects invalid input", async () => {
		await expect(
			caller.enable({ manager, subnet: "100.96.0.0/8" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			caller.addNode({ meshId: "m1", name: "bad name;", ...manager }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			caller.addNode({
				meshId: "m1",
				name: "vm",
				...manager,
				sshAddress: "host; rm -rf /",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("maps provisioning errors to a readable precondition failure", async () => {
		const { ClusterMeshError } = await import(
			"@dokploy/server/services/cluster-mesh/provision"
		);
		mocks.enableClusterMesh.mockRejectedValue(
			new ClusterMeshError("This server is not a swarm manager."),
		);
		await expect(
			caller.enable({ manager, subnet: "100.96.0.0/24" }),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			message: "This server is not a swarm manager.",
		});
	});

	it("blocks activation while preflight findings are unacknowledged", async () => {
		vi.mocked(db.query.clusterNode.findFirst).mockResolvedValue(
			nodeRow() as never,
		);
		mocks.findClusterPreflightIssues.mockResolvedValue([{ id: "a1" }]);

		await expect(
			caller.activateNode({ clusterNodeId: "n1" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(mocks.setClusterNodeAvailability).not.toHaveBeenCalled();

		await caller.activateNode({
			clusterNodeId: "n1",
			acknowledgeFindings: true,
		});
		expect(mocks.setClusterNodeAvailability).toHaveBeenCalledWith(
			"n1",
			"active",
		);
	});

	it("checks the preflight when setting availability to active, not when pausing", async () => {
		vi.mocked(db.query.clusterNode.findFirst).mockResolvedValue(
			nodeRow() as never,
		);
		mocks.findClusterPreflightIssues.mockResolvedValue([{ id: "a1" }]);

		await caller.setAvailability({
			clusterNodeId: "n1",
			availability: "pause",
		});
		expect(mocks.findClusterPreflightIssues).not.toHaveBeenCalled();
		await expect(
			caller.setAvailability({ clusterNodeId: "n1", availability: "active" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	it("hides VMs of other organizations", async () => {
		vi.mocked(db.query.clusterNode.findFirst).mockResolvedValue(
			nodeRow("org-2") as never,
		);
		await expect(
			caller.removeNode({ clusterNodeId: "n1" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(mocks.removeClusterNode).not.toHaveBeenCalled();

		mocks.findMeshBySwarm.mockResolvedValue({
			meshId: "m1",
			organizationId: "org-2",
			nodes: [],
		});
		await expect(caller.get({})).resolves.toBeNull();
	});

	it("needs Docker read permission to view the mesh", async () => {
		mocks.findMeshBySwarm.mockResolvedValue(null);
		await caller.get({});
		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			docker: ["read"],
		});
	});

	it("suggests the Docker gateway and public IP for the Dokploy host", async () => {
		await expect(caller.defaults({})).resolves.toMatchObject({
			sshAddress: "172.17.0.1",
			endpointAddress: "203.0.113.1",
			sshKeyId: null,
		});
	});

	it("sets a VM's pool only for VMs of the caller's organization", async () => {
		vi.mocked(db.query.clusterNode.findFirst).mockResolvedValue({
			...nodeRow(),
			swarmNodeId: "swarm-1",
		} as never);
		await caller.setNodePool({ clusterNodeId: "n1", pool: "eu" });
		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			server: ["create"],
		});
		expect(mocks.setSwarmNodePool).toHaveBeenCalledWith({
			serverId: null,
			swarmNodeId: "swarm-1",
			pool: "eu",
		});

		await expect(
			caller.setNodePool({ clusterNodeId: "n1", pool: "bad pool!" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		vi.mocked(db.query.clusterNode.findFirst).mockResolvedValue(
			nodeRow("org-2") as never,
		);
		await expect(
			caller.setNodePool({ clusterNodeId: "n1", pool: "eu" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

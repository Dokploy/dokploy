import { listComposeTasks, resolveComposeTask } from "@dokploy/server/services/swarm-task";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  findComposeById: vi.fn(),
  checkServiceAccess: vi.fn(),
  checkPermission: vi.fn(),
  findServerById: vi.fn(),
  getRemoteDocker: vi.fn(),
}));

vi.mock("@dokploy/server/services/compose", () => ({
  findComposeById: boundary.findComposeById,
}));
vi.mock("@dokploy/server/services/permission", () => ({
  checkServiceAccess: boundary.checkServiceAccess,
  checkPermission: boundary.checkPermission,
}));
vi.mock("@dokploy/server/services/server", () => ({
  findServerById: boundary.findServerById,
}));
vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
  getRemoteDocker: boundary.getRemoteDocker,
}));

const ctx = {
  user: { id: "user-1" },
  session: { activeOrganizationId: "org-1" },
};
const composeId = "compose-1";
const namespace = "worker-poc";

function taskFixture(index: number) {
  return {
    ID: (index === 1 ? "a" : "b").repeat(25),
    ServiceID: "service-1",
    NodeID: `node-${index}`,
    Slot: index,
    DesiredState: "running",
    Status: {
      State: "running",
      ContainerStatus: { ContainerID: String(index).repeat(64) },
    },
  };
}

function workerFixture(index: number) {
  return {
    info: vi.fn().mockResolvedValue({
      Swarm: {
        NodeID: `node-${index}`,
        Cluster: { ID: "cluster-1" },
        LocalNodeState: "active",
      },
    }),
    getContainer: vi.fn(),
  };
}

const workerOne = workerFixture(1);
const workerTwo = workerFixture(2);
const manager = {
  info: vi.fn(),
  getTask: vi.fn(),
  getService: vi.fn(),
  getNode: vi.fn(),
  listServices: vi.fn(),
  listTasks: vi.fn(),
  listNodes: vi.fn(),
  getContainer: vi.fn(),
};
const inspectTask = vi.fn();
const inspectService = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(
    "DOKPLOY_SWARM_NODE_SERVERS",
    JSON.stringify({ "node-1": "ssh-1", "node-2": "ssh-2" }),
  );
  boundary.findComposeById.mockResolvedValue({
    composeId,
    appName: namespace,
    composeType: "stack",
    serverId: null,
    environment: { project: { organizationId: "org-1" } },
  });
  boundary.checkServiceAccess.mockResolvedValue(undefined);
  boundary.checkPermission.mockResolvedValue(undefined);
  boundary.findServerById.mockImplementation(async (serverId: string) => ({
    serverId,
    organizationId: "org-1",
    sshKeyId: "key-1",
    sshKey: { privateKey: "test-private-key" },
  }));
  boundary.getRemoteDocker.mockImplementation(async (serverId: string | null) => {
    if (serverId === "ssh-1") return workerOne;

    if (serverId === "ssh-2") return workerTwo;

    if (serverId === null) return manager;

    throw new Error(`Unexpected Docker connection: ${serverId}`);
  });
  manager.info.mockResolvedValue({
    Swarm: {
      NodeID: "manager-1",
      Cluster: { ID: "cluster-1" },
      ControlAvailable: true,
    },
  });
  workerOne.info.mockResolvedValue({
    Swarm: {
      ControlAvailable: false,
      NodeID: "node-1",
      Cluster: { ID: "cluster-1" },
    },
  });
  workerTwo.info.mockResolvedValue({
    Swarm: {
      ControlAvailable: false,
      NodeID: "node-2",
      Cluster: { ID: "cluster-1" },
    },
  });
  inspectTask.mockImplementation(async (taskId: string) =>
    taskFixture(taskId === "a".repeat(25) ? 1 : 2),
  );
  manager.getTask.mockImplementation((taskId: string) => ({
    inspect: () => inspectTask(taskId),
  }));
  inspectService.mockResolvedValue({
    ID: "service-1",
    Spec: {
      Name: `${namespace}_api`,
      Labels: { "com.docker.stack.namespace": namespace },
    },
  });
  manager.getService.mockReturnValue({ inspect: inspectService });
  manager.getNode.mockImplementation((nodeId: string) => ({
    inspect: async () => ({
      ID: nodeId,
      Description: { Hostname: `host-${nodeId}` },
    }),
  }));
  manager.listServices.mockImplementation(async () => [await inspectService()]);
  manager.listTasks.mockResolvedValue([taskFixture(1), taskFixture(2)]);
  manager.listNodes.mockResolvedValue(
    [1, 2].map((index) => ({
      ID: `node-${index}`,
      Description: { Hostname: `host-node-${index}` },
    })),
  );
});

afterEach(() => vi.unstubAllEnvs());

describe("compose task routing", () => {
  it("lists both replicas and resolves each full container ID on its own worker", async () => {
    const tasks = await listComposeTasks(ctx, composeId);

    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: "a".repeat(25),
          nodeId: "node-1",
          containerId: "1".repeat(64),
        }),
        expect.objectContaining({
          taskId: "b".repeat(25),
          nodeId: "node-2",
          containerId: "2".repeat(64),
        }),
      ]),
    );
    expect(tasks).toHaveLength(2);

    const first = await resolveComposeTask(ctx, composeId, "a".repeat(25));
    const second = await resolveComposeTask(ctx, composeId, "b".repeat(25));

    expect(first.docker).toBe(workerOne);
    expect(second.docker).toBe(workerTwo);
    expect(first.containerId).toBe("1".repeat(64));
    expect(second.containerId).toBe("2".repeat(64));
    expect(first.statsKey).not.toBe(second.statsKey);
    expect(manager.getContainer).not.toHaveBeenCalled();
  });

  it("rejects a foreign organization before opening any Docker connection", async () => {
    boundary.findComposeById.mockResolvedValue({
      composeId,
      appName: namespace,
      composeType: "stack",
      serverId: null,
      environment: { project: { organizationId: "org-foreign" } },
    });

    await expect(resolveComposeTask(ctx, composeId, "a".repeat(25))).rejects.toThrow();
    await expect(listComposeTasks(ctx, composeId)).rejects.toThrow();
    expect(boundary.getRemoteDocker).not.toHaveBeenCalled();
  });

  it("rejects a caller without compose service access before connecting", async () => {
    boundary.checkServiceAccess.mockRejectedValue(new Error("Access denied"));

    await expect(resolveComposeTask(ctx, composeId, "a".repeat(25))).rejects.toThrow();
    await expect(listComposeTasks(ctx, composeId)).rejects.toThrow();
    expect(boundary.getRemoteDocker).not.toHaveBeenCalled();
  });

  it("rejects a task from another compose service in the same organization", async () => {
    inspectService.mockResolvedValue({
      ID: "service-other",
      Spec: {
        Name: "other_api",
        Labels: { "com.docker.stack.namespace": "other" },
      },
    });

    await expect(resolveComposeTask(ctx, composeId, "a".repeat(25))).rejects.toThrow();
    expect(boundary.findServerById).not.toHaveBeenCalled();
    expect(workerOne.info).not.toHaveBeenCalled();
  });

  it("requires Docker privilege for restart even when compose reads are allowed", async () => {
    boundary.checkPermission.mockRejectedValue(new Error("Docker permission denied"));

    await expect(resolveComposeTask(ctx, composeId, "a".repeat(25), "restart")).rejects.toThrow();
    expect(boundary.getRemoteDocker).not.toHaveBeenCalled();
    expect(boundary.checkPermission).toHaveBeenCalledWith(ctx, {
      docker: ["read"],
    });
  });
});

describe("compose task freshness", () => {
  it.each(["shutdown", "failed"])(
    "rejects a %s task before a restart can reach a worker",
    async (state) => {
      const task = taskFixture(1);

      task.Status.State = state;
      inspectTask.mockResolvedValue(task);

      await expect(resolveComposeTask(ctx, composeId, "a".repeat(25), "restart")).rejects.toThrow();
      expect(workerOne.getContainer).not.toHaveBeenCalled();
      expect(manager.getContainer).not.toHaveBeenCalled();
      expect(workerOne.info).not.toHaveBeenCalled();
    },
  );

  it("rejects a running task already marked for replacement", async () => {
    inspectTask.mockResolvedValue({
      ...taskFixture(1),
      DesiredState: "shutdown",
    });

    await expect(resolveComposeTask(ctx, composeId, "a".repeat(25), "restart")).rejects.toThrow();
    expect(workerOne.info).not.toHaveBeenCalled();
  });

  it("rejects a task that becomes stale while connecting to its worker", async () => {
    inspectTask.mockResolvedValueOnce(taskFixture(1)).mockResolvedValueOnce({
      ...taskFixture(1),
      DesiredState: "shutdown",
    });

    await expect(resolveComposeTask(ctx, composeId, "a".repeat(25), "restart")).rejects.toThrow();
    expect(workerOne.info).toHaveBeenCalledOnce();
    expect(inspectTask).toHaveBeenCalledTimes(2);
    expect(workerOne.getContainer).not.toHaveBeenCalled();
  });
});

describe("compose worker identity", () => {
  it("does not fall back to the manager when a worker is unavailable", async () => {
    workerOne.info.mockRejectedValue(new Error("SSH unavailable"));

    await expect(resolveComposeTask(ctx, composeId, "a".repeat(25))).rejects.toThrow();
    expect(manager.getContainer).not.toHaveBeenCalled();
    expect(workerOne.info).toHaveBeenCalledOnce();
    expect(workerTwo.info).not.toHaveBeenCalled();
  });

  it.each([
    { NodeID: "wrong-node", Cluster: { ID: "cluster-1" } },
    { NodeID: "node-1", Cluster: { ID: "wrong-cluster" } },
  ])("rejects a registered endpoint with mismatched Swarm identity: %j", async (Swarm) => {
    workerOne.info.mockResolvedValue({
      Swarm: { ControlAvailable: false, ...Swarm },
    });

    await expect(resolveComposeTask(ctx, composeId, "a".repeat(25))).rejects.toThrow();
    expect(workerOne.info).toHaveBeenCalledOnce();
    expect(workerOne.getContainer).not.toHaveBeenCalled();
    expect(manager.getContainer).not.toHaveBeenCalled();
  });

  it("accepts a worker without Cluster when its manager membership matches", async () => {
    workerOne.info.mockResolvedValue({
      Swarm: {
        NodeID: "node-1",
        ControlAvailable: false,
        RemoteManagers: [{ NodeID: "manager-1" }],
      },
    });

    const target = await resolveComposeTask(ctx, composeId, "a".repeat(25));

    expect(target.docker).toBe(workerOne);
    expect(target.containerId).toBe("1".repeat(64));
  });

  it.each([undefined, [], [{ NodeID: "foreign-manager" }]])(
    "rejects a worker without Cluster or matching manager membership: %j",
    async (RemoteManagers) => {
      workerOne.info.mockResolvedValue({
        Swarm: {
          NodeID: "node-1",
          ControlAvailable: false,
          RemoteManagers,
        },
      });

      await expect(resolveComposeTask(ctx, composeId, "a".repeat(25))).rejects.toThrow();
      expect(workerOne.info).toHaveBeenCalledOnce();
      expect(workerOne.getContainer).not.toHaveBeenCalled();
    },
  );

  it("rejects an unmapped worker without attempting a local container lookup", async () => {
    vi.stubEnv("DOKPLOY_SWARM_NODE_SERVERS", "{}");

    await expect(resolveComposeTask(ctx, composeId, "a".repeat(25))).rejects.toThrow();
    expect(boundary.getRemoteDocker).toHaveBeenCalledTimes(1);
    expect(manager.getContainer).not.toHaveBeenCalled();
  });

  it.each([
    {
      organizationId: "org-foreign",
      sshKeyId: "key-1",
      sshKey: { privateKey: "key" },
    },
    { organizationId: "org-1", sshKeyId: null, sshKey: null },
    { organizationId: "org-1", sshKeyId: "key-1", sshKey: { privateKey: "" } },
  ])("rejects an untrusted SSH registration before connecting: %j", async (server) => {
    boundary.findServerById.mockResolvedValue(server);

    await expect(resolveComposeTask(ctx, composeId, "a".repeat(25))).rejects.toThrow();
    expect(boundary.findServerById).toHaveBeenCalledWith("ssh-1");
    expect(boundary.getRemoteDocker).toHaveBeenCalledTimes(1);
    expect(manager.getContainer).not.toHaveBeenCalled();
    expect(workerOne.info).not.toHaveBeenCalled();
  });
});

describe("compose task ID input", () => {
  it.each([
    "",
    "short",
    "../services/example",
    `${"a".repeat(25)}?x=1`,
    "A".repeat(25),
    "a".repeat(26),
  ])("rejects malformed Docker task IDs before connecting: %j", async (taskId) => {
    await expect(resolveComposeTask(ctx, composeId, taskId)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(boundary.getRemoteDocker).not.toHaveBeenCalled();
    expect(manager.getTask).not.toHaveBeenCalled();
  });
});

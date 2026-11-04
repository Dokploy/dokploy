import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import { clearTimeout as realClearTimeout, setTimeout as realSetTimeout } from "node:timers";
import { listComposeTasks, resolveComposeTask } from "@dokploy/server/services/swarm-task";
import type { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";
import { type Connection, Server as SshServer } from "ssh2";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  findComposeById: vi.fn(),
  checkServiceAccess: vi.fn(),
  checkPermission: vi.fn(),
  findServerById: vi.fn(),
  getRemoteDocker: vi.fn(),
  audit: vi.fn(),
  openProcessStream: vi.fn(),
  dockerTransport: vi.fn(),
}));

vi.mock("dockerode", () => ({
  default: function DockerTransport(options: DockerConnectionOptions) {
    return boundary.dockerTransport(options);
  },
}));
vi.mock("@dokploy/server/utils/process/remoteStream", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dokploy/server/utils/process/remoteStream")>()),
  openProcessStream: boundary.openProcessStream,
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

vi.mock("@dokploy/server", async () => ({
  ...(await import("@dokploy/server/services/swarm-task")),
}));
vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@/server/api/utils/audit", () => ({ audit: boundary.audit }));

const { openProcessStream: realOpenProcessStream } = await vi.importActual<
  typeof import("@dokploy/server/utils/process/remoteStream")
>("@dokploy/server/utils/process/remoteStream");

const { dockerRouter } = await import("@/server/api/routers/docker");

type DockerConnectionOptions = {
  host: string;
  port: number;
  protocol: "http" | "ssh";
  username?: string;
  sshOptions?: { privateKey: string };
};
const Dockerode = createRequire(import.meta.url)("dockerode") as new (
  options: DockerConnectionOptions,
) => Awaited<ReturnType<typeof getRemoteDocker>>;

const ctx = {
  user: { id: "user-1" },
  session: { activeOrganizationId: "org-1" },
};
const composeId = "compose-1";
const namespace = "worker-poc";
const caller = dockerRouter.createCaller(ctx as Parameters<typeof dockerRouter.createCaller>[0]);
const stop = vi.fn();

function serviceFixture() {
  return {
    ID: "service-1",
    Spec: {
      Name: `${namespace}_api`,
      Labels: { "com.docker.stack.namespace": namespace },
      Mode: { Replicated: { Replicas: 2 } },
      TaskTemplate: { RestartPolicy: { Condition: "any", MaxAttempts: 0 } },
    },
  };
}

function taskFixture(index: number) {
  return {
    ID: (index === 1 ? "a" : "b").repeat(25),
    ServiceID: "service-1",
    NodeID: `node-${index}`,
    Slot: index,
    Spec: {
      ContainerSpec: { StopGracePeriod: 60_000_000_000 },
      RestartPolicy: { Condition: "any", MaxAttempts: 0 },
    },
    DesiredState: "running",
    Status: {
      State: "running",
      ContainerStatus: { ContainerID: String(index).repeat(64) },
    },
  };
}

function workerFixture(index: number) {
  return {
    modem: { protocol: "ssh", sshOptions: {} },
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
  stop.mockResolvedValue(undefined);
  boundary.openProcessStream.mockImplementation(async (serverId: string) => {
    boundary.dockerTransport.mockReturnValue(serverId === "ssh-1" ? workerOne : workerTwo);
    const channel = new PassThrough();

    return {
      stdin: channel,
      stdout: channel,
      stderr: new PassThrough(),
      exit: Promise.resolve(0),
      close: vi.fn(),
    };
  });
  workerOne.getContainer.mockReturnValue({ stop });
  workerTwo.getContainer.mockReturnValue({ stop });
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
    inspect: (options: ReadOptions) => inspectTask(taskId, options),
  }));
  inspectService.mockResolvedValue(serviceFixture());
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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

type ReadOptions = { abortSignal: AbortSignal };

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

  it.each(["task", "service"])(
    "returns a conflict without stopping anything when Docker has pruned the %s",
    async (resource) => {
      const missing = Object.assign(new Error(`No such ${resource}`), { statusCode: 404 });
      const inspect = resource === "task" ? inspectTask : inspectService;

      inspect.mockRejectedValueOnce(missing);

      await expect(
        caller.restartComposeTask({ composeId, taskId: "a".repeat(25) }),
      ).rejects.toMatchObject({ code: "CONFLICT", cause: missing });
      expect(stop).not.toHaveBeenCalled();
      expect(boundary.audit).not.toHaveBeenCalled();
    },
  );

  it("preserves other Docker failures instead of reporting a stale task", async () => {
    const unavailable = Object.assign(new Error("Docker unavailable"), { statusCode: 503 });

    inspectTask.mockRejectedValueOnce(unavailable);

    await expect(
      caller.restartComposeTask({ composeId, taskId: "a".repeat(25) }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", cause: unavailable });
    expect(stop).not.toHaveBeenCalled();
    expect(boundary.audit).not.toHaveBeenCalled();
  });

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

describe("compose task restart endpoint", () => {
  it.each([
    { Condition: "none" },
    { Condition: "on-failure" },
    { Condition: "any", MaxAttempts: 3 },
  ])("rejects unsafe restart policies before stopping a replica: %j", async (policy) => {
    for (const source of ["task", "service"]) {
      const task = taskFixture(1);
      const service = serviceFixture();

      inspectTask.mockResolvedValue(
        source === "task" ? { ...task, Spec: { ...task.Spec, RestartPolicy: policy } } : task,
      );
      inspectService.mockResolvedValue(
        source === "service"
          ? { ...service, Spec: { ...service.Spec, TaskTemplate: { RestartPolicy: policy } } }
          : service,
      );

      await expect(caller.restartComposeTask({ composeId, taskId: task.ID })).rejects.toMatchObject(
        { code: "PRECONDITION_FAILED" },
      );
      expect(stop).not.toHaveBeenCalled();
      expect(boundary.audit).not.toHaveBeenCalled();
    }
  });

  it("stops only the selected replica with its configured grace period", async () => {
    const service = serviceFixture();

    inspectService.mockResolvedValue({
      ...service,
      Spec: {
        ...service.Spec,
        TaskTemplate: { ...service.Spec.TaskTemplate, ContainerSpec: { StopGracePeriod: 1e9 } },
      },
    });

    await caller.restartComposeTask({ composeId, taskId: "a".repeat(25) });

    expect(stop).toHaveBeenCalledExactlyOnceWith({ t: 60, abortSignal: expect.any(AbortSignal) });
    expect(workerOne.getContainer).toHaveBeenCalledExactlyOnceWith("1".repeat(64));
    expect(workerTwo.getContainer).not.toHaveBeenCalled();
    expect(manager.getContainer).not.toHaveBeenCalled();
    expect(boundary.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ resourceId: "1".repeat(64) }),
    );
  });

  it("rounds fractional shutdown allowances up instead of cutting them short", async () => {
    const task = taskFixture(1);

    inspectTask.mockResolvedValue({
      ...task,
      Spec: { ...task.Spec, ContainerSpec: { StopGracePeriod: 10_500_000_000 } },
    });

    await caller.restartComposeTask({ composeId, taskId: task.ID });

    expect(stop).toHaveBeenCalledExactlyOnceWith({ t: 11, abortSignal: expect.any(AbortSignal) });
  });

  it("uses the Swarm default when the task omits its grace period and restart policy", async () => {
    const task = taskFixture(1);
    const service = serviceFixture();

    inspectTask.mockResolvedValue({ ...task, Spec: { ContainerSpec: {} } });
    inspectService.mockResolvedValue({ ...service, Spec: { ...service.Spec, TaskTemplate: {} } });

    await caller.restartComposeTask({ composeId, taskId: task.ID });

    expect(stop).toHaveBeenCalledExactlyOnceWith({ t: 10, abortSignal: expect.any(AbortSignal) });
  });
});

describe("compose Docker read cancellation", () => {
  it("destroys a stalled Docker HTTP request when resolution reaches its deadline", async () => {
    let requestArrived = () => {};

    let connectionClosed = () => {};

    const arrived = new Promise<void>((resolve) => {
      requestArrived = resolve;
    });
    const closed = new Promise<void>((resolve) => {
      connectionClosed = resolve;
    });
    const server = createServer((request) => {
      request.socket.once("close", connectionClosed);
      requestArrived();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const docker = new Dockerode({ host: "127.0.0.1", port: address.port, protocol: "http" });

    manager.info.mockImplementation(docker.info.bind(docker));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    try {
      const result = expect(
        resolveComposeTask(ctx, composeId, "a".repeat(25)),
      ).rejects.toMatchObject({
        code: "TIMEOUT",
      });

      await arrived;
      await vi.advanceTimersByTimeAsync(10_000);
      await result;
      await closed;

      expect(workerOne.info).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("supplies abortable transport options to discovery and task inspection reads", async () => {
    await listComposeTasks(ctx, composeId);
    await resolveComposeTask(ctx, composeId, "a".repeat(25));

    for (const read of [
      manager.info,
      workerOne.info,
      manager.listServices,
      manager.listTasks,
      manager.listNodes,
      inspectService,
    ]) {
      expect(read).toHaveBeenCalledWith(
        expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
      );
    }

    expect(inspectTask).toHaveBeenCalledWith("a".repeat(25), {
      abortSignal: expect.any(AbortSignal),
    });
  });
});

describe("compose SSH read cancellation", () => {
  it("closes authenticated SSH when the server never answers channel-open", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
    });
    let channelRequested = () => {};

    const requested = new Promise<void>((resolve) => {
      channelRequested = resolve;
    });
    const connections = new Set<Connection>();
    const server = new SshServer({ hostKeys: [privateKey] }, (connection) => {
      connections.add(connection);
      connection.on("error", () => {});
      connection.once("close", () => connections.delete(connection));
      connection.on("authentication", (context) => context.accept());
      // Authenticate, then deliberately neither accept nor reject the requested SSH channel.
      connection.on("session", () => channelRequested());
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;

    boundary.openProcessStream.mockImplementation(realOpenProcessStream);
    boundary.dockerTransport.mockImplementation(
      (options: DockerConnectionOptions) => new Dockerode(options),
    );
    const docker = new Dockerode({
      host: "127.0.0.1",
      port: address.port,
      protocol: "ssh",
      username: "test",
      sshOptions: { privateKey },
    });

    boundary.findServerById.mockResolvedValue({
      organizationId: "org-1",
      sshKeyId: "generated-test-key",
      sshKey: { privateKey },
      ipAddress: "127.0.0.1",
      port: address.port,
      username: "test",
    });
    boundary.getRemoteDocker.mockImplementation(async (serverId: string | null) =>
      serverId === "ssh-1" ? docker : manager,
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let watchdog: ReturnType<typeof realSetTimeout> | undefined;

    try {
      const resolution = resolveComposeTask(ctx, composeId, "a".repeat(25));
      const result = resolution.then(
        () => ({ code: "unexpected-success" }),
        (error: Error) => error,
      );

      await requested;
      expect(connections.size).toBe(1);
      await vi.advanceTimersByTimeAsync(10_000);
      const deadlineResult = await Promise.race([
        result,
        new Promise((resolve) => {
          watchdog = realSetTimeout(() => resolve({ code: "still-pending" }), 200);
        }),
      ]);

      expect(deadlineResult).toMatchObject({ code: "TIMEOUT" });
      vi.useRealTimers();
      await vi.waitFor(() => expect(connections.size).toBe(0));
    } finally {
      realClearTimeout(watchdog);
      vi.useRealTimers();

      for (const connection of connections) connection.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

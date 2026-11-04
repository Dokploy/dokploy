import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ClientOptions, WebSocket } from "ws";

const boundary = vi.hoisted(() => ({
  validateRequest: vi.fn(),
  resolveComposeTask: vi.fn(),
}));

vi.mock("@dokploy/server", () => boundary);

type ServerSocketConstructor = new (
  address: null,
  protocols: undefined,
  options: ClientOptions,
) => WebSocket;
// ws requires server options at runtime, but its null-address overload omits them.
const ServerSocket = WebSocket as ServerSocketConstructor;

class Viewer extends ServerSocket {
  disconnected = false;

  constructor() {
    super(null, undefined, {});
    Object.defineProperty(this, "readyState", {
      get: () => (this.disconnected ? WebSocket.CLOSED : WebSocket.OPEN),
    });
  }
  send = vi.fn();
  close = vi.fn(() => {
    this.disconnected = true;
    this.emit("close");
  });
}

const request = new IncomingMessage(new Socket());
const stats = vi.fn();
const getContainer = vi.fn(() => ({ stats }));
const session = {
  user: { id: "user-1" },
  session: { activeOrganizationId: "org-1" },
};
const sample = {
  read: "2026-11-04T12:00:00.000Z",
  cpu_stats: {
    cpu_usage: { total_usage: 200 },
    system_cpu_usage: 2000,
    online_cpus: 2,
  },
  precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000 },
  memory_stats: { usage: 1024, limit: 4096, stats: { inactive_file: 0 } },
  blkio_stats: {
    io_service_bytes_recursive: [
      { op: "Read", value: 1048576 },
      { op: "Write", value: 2097152 },
    ],
  },
  networks: { eth0: { rx_bytes: 3145728, tx_bytes: 4194304 } },
};
let subscribe: typeof import("@/server/wss/swarm-stats").subscribeComposeTaskStats;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  boundary.validateRequest.mockResolvedValue(session);
  boundary.resolveComposeTask.mockResolvedValue({
    docker: { getContainer },
    containerId: "a".repeat(64),
    taskId: "task-1",
    nodeId: "node-1",
    serverId: "ssh-1",
    statsKey: "compose-1:node-1:container-1",
  });
  getContainer.mockReturnValue({ stats });
  stats.mockResolvedValue(sample);
  subscribe = (await import("@/server/wss/swarm-stats")).subscribeComposeTaskStats;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function connect(viewer: Viewer) {
  return subscribe(viewer, request, "compose-1", "task-1");
}

describe("compose task live metrics", () => {
  it("shares one in-flight Docker sample between two authorized viewers", async () => {
    let release = (_sample: typeof sample) => {};

    stats.mockReturnValue(
      new Promise<typeof sample>((resolve) => {
        release = resolve;
      }),
    );
    const first = new Viewer();
    const second = new Viewer();
    const firstConnection = connect(first);
    const secondConnection = connect(second);

    await vi.advanceTimersByTimeAsync(0);
    expect(stats).toHaveBeenCalledTimes(1);
    expect(boundary.resolveComposeTask).toHaveBeenCalledTimes(2);

    release(sample);
    await Promise.all([firstConnection, secondConnection]);

    expect(stats).toHaveBeenCalledWith({ stream: false, abortSignal: expect.any(AbortSignal) });
    expect(getContainer).toHaveBeenCalledWith("a".repeat(64));
    expect(first.send).toHaveBeenCalledOnce();
    expect(second.send).toHaveBeenCalledWith(first.send.mock.calls[0]?.[0]);
    expect(first.send).toHaveBeenCalledWith(
      JSON.stringify({
        data: {
          cpu: { time: sample.read, value: "20.00%" },
          memory: {
            time: sample.read,
            value: { used: "1024B", total: "4096B" },
          },
          block: { time: sample.read, value: { readMb: 1.048576, writeMb: 2.097152 } },
          network: { time: sample.read, value: { inputMb: 3.145728, outputMb: 4.194304 } },
        },
      }),
    );
    first.close();
    second.close();
  });
});

describe("compose task metrics access", () => {
  it.each(["Unauthorized task", "Task no longer running"])(
    "closes without stats when resolution fails: %s",
    async (message) => {
      boundary.resolveComposeTask.mockRejectedValue(new Error(message));
      const viewer = new Viewer();

      await connect(viewer);

      expect(stats).not.toHaveBeenCalled();
      expect(viewer.send).not.toHaveBeenCalled();
      expect(viewer.close).toHaveBeenCalledWith(4000, expect.any(String));
      expect(viewer.close.mock.calls[0]).not.toContain(message);
    },
  );

  it("rejects an expired session before resolving a task", async () => {
    boundary.validateRequest.mockResolvedValue({ user: null, session: null });
    const viewer = new Viewer();

    await connect(viewer);

    expect(boundary.resolveComposeTask).not.toHaveBeenCalled();
    expect(stats).not.toHaveBeenCalled();
    expect(viewer.close).toHaveBeenCalled();
  });

  it("closes safely when worker stats fail and does not poll again", async () => {
    stats.mockRejectedValue(new Error("SSH secret connection detail"));
    const viewer = new Viewer();

    await connect(viewer);
    await vi.advanceTimersByTimeAsync(5000);

    expect(stats).toHaveBeenCalledOnce();
    expect(viewer.close).toHaveBeenCalledWith(4000, expect.any(String));
    expect(viewer.close.mock.calls[0]).not.toContain("SSH secret connection detail");
    expect(viewer.send).not.toHaveBeenCalled();
  });

  it("revalidates access each poll and never serves a cached sample after revocation", async () => {
    const viewer = new Viewer();

    await connect(viewer);
    boundary.resolveComposeTask.mockRejectedValue(new Error("Access revoked"));

    await vi.advanceTimersByTimeAsync(1300);

    expect(boundary.validateRequest).toHaveBeenCalledTimes(2);
    expect(boundary.resolveComposeTask).toHaveBeenCalledTimes(2);
    expect(stats).toHaveBeenCalledOnce();
    expect(viewer.send).toHaveBeenCalledOnce();
    expect(viewer.close).toHaveBeenCalledWith(4000, expect.any(String));
  });
});

describe("compose task metrics lifecycle", () => {
  it("does not overlap a slow sample and closes at the deadline", async () => {
    let release = (_sample: typeof sample) => {};

    stats.mockReturnValue(
      new Promise<typeof sample>((resolve) => {
        release = resolve;
      }),
    );
    const viewer = new Viewer();
    const connection = connect(viewer);

    await vi.advanceTimersByTimeAsync(15_000);

    expect(stats).toHaveBeenCalledOnce();
    expect(boundary.validateRequest).toHaveBeenCalledOnce();
    expect(viewer.close).toHaveBeenCalledWith(4000, expect.any(String));

    release(sample);
    await connection;
    await vi.advanceTimersByTimeAsync(5000);

    expect(stats).toHaveBeenCalledOnce();
    expect(viewer.send).not.toHaveBeenCalled();
  });

  it("does not deliver an in-flight sample after the socket closes", async () => {
    let release = (_sample: typeof sample) => {};

    stats.mockReturnValue(
      new Promise<typeof sample>((resolve) => {
        release = resolve;
      }),
    );
    const viewer = new Viewer();
    const connection = connect(viewer);

    await vi.advanceTimersByTimeAsync(0);

    viewer.close();
    release(sample);
    await connection;
    await vi.advanceTimersByTimeAsync(5000);

    expect(stats).toHaveBeenCalledOnce();
    expect(viewer.send).not.toHaveBeenCalled();
  });

  it("stops polling when the socket closes", async () => {
    const viewer = new Viewer();

    await connect(viewer);

    viewer.close();
    await vi.advanceTimersByTimeAsync(5000);

    expect(stats).toHaveBeenCalledOnce();
    expect(boundary.validateRequest).toHaveBeenCalledOnce();
    expect(viewer.send).toHaveBeenCalledOnce();
  });
});

describe("compose metrics reconnect", () => {
  it("aborts a hung worker sample and allows a fresh sample after cache expiry", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(controller.signal);

    type StatsOptions = { stream: false; abortSignal: AbortSignal };
    stats.mockImplementationOnce(
      (options: StatsOptions) =>
        new Promise((_, reject) => {
          options.abortSignal.addEventListener("abort", () => reject(options.abortSignal.reason), {
            once: true,
          });
        }),
    );
    const failedViewer = new Viewer();
    const failedConnection = connect(failedViewer);

    await vi.advanceTimersByTimeAsync(0);

    expect(timeout).toHaveBeenCalledWith(10_000);
    controller.abort(new Error("Worker timeout"));
    await failedConnection;

    expect(failedViewer.close).toHaveBeenCalledWith(4000, expect.any(String));
    expect(failedViewer.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1300);
    const recoveredViewer = new Viewer();

    await connect(recoveredViewer);

    expect(stats).toHaveBeenCalledTimes(2);
    expect(recoveredViewer.send).toHaveBeenCalledOnce();
    expect(recoveredViewer.close).not.toHaveBeenCalled();
    recoveredViewer.close();
  });
});

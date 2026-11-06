import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import { openProcessStream } from "@dokploy/server/utils/process/remoteStream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  findServerById: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@dokploy/server/services/server", () => ({ findServerById: boundary.findServerById }));
vi.mock("@dokploy/server/utils/process/execAsync", () => ({ sshKeepalive: {} }));
vi.mock("ssh2", () => ({
  Client: function Client() {
    return boundary.createClient();
  },
}));

class Channel extends PassThrough {
  stderr = new PassThrough();
  signal = vi.fn();
  close = vi.fn(() => this.emit("close"));
}

type ExecCallback = (error: Error | null, channel: Channel) => void;

class Connection extends EventEmitter {
  channel = new Channel();
  connect = vi.fn(() => this);
  exec = vi.fn((_command: string, callback: ExecCallback) => callback(null, this.channel));
  destroy = vi.fn(() => this.emit("close"));
  end = vi.fn(() => this.emit("close"));
}

let connection: Connection;

beforeEach(() => {
  vi.clearAllMocks();
  connection = new Connection();
  boundary.createClient.mockReturnValue(connection);
  boundary.findServerById.mockResolvedValue({
    sshKeyId: "key",
    sshKey: { privateKey: "private-key" },
    ipAddress: "worker",
    port: 22,
    username: "root",
  });
});

describe("remote process cancellation", () => {
  it("destroys an SSH connection stalled during its handshake", async () => {
    const controller = new AbortController();
    const pending = openProcessStream("worker", "exec docker stats", controller.signal);
    const rejected = expect(pending).rejects.toThrow("deadline");

    await vi.waitFor(() => expect(connection.connect).toHaveBeenCalledOnce());
    controller.abort(new Error("deadline"));
    await rejected;

    expect(connection.destroy).toHaveBeenCalledOnce();
    expect(connection.exec).not.toHaveBeenCalled();
  });

  it("kills a hung remote command and settles its exit when aborted", async () => {
    const controller = new AbortController();
    const pending = openProcessStream("worker", "exec docker stats", controller.signal);

    await vi.waitFor(() => expect(connection.connect).toHaveBeenCalledOnce());
    connection.emit("ready");
    const process = await pending;

    controller.abort(new Error("deadline"));

    await expect(process.exit).resolves.not.toBe(0);
    expect(connection.channel.signal).toHaveBeenCalledWith("KILL");
    expect(connection.channel.close).toHaveBeenCalled();
    expect(connection.destroy).toHaveBeenCalledOnce();
  });

  it("does not start a connection after cancellation during server lookup", async () => {
    const controller = new AbortController();
    const pending = openProcessStream("worker", "exec docker stats", controller.signal);

    controller.abort(new Error("cancelled"));

    await expect(pending).rejects.toThrow("cancelled");
    expect(boundary.createClient).not.toHaveBeenCalled();
  });

  it("settles a running command if the SSH connection disappears without channel exit", async () => {
    const pending = openProcessStream("worker", "exec docker stats");

    await vi.waitFor(() => expect(connection.connect).toHaveBeenCalledOnce());
    connection.emit("ready");
    const process = await pending;

    connection.emit("close");

    await expect(process.exit).resolves.not.toBe(0);
  });
});

describe("existing process callers", () => {
  it("preserves successful remote exit and removes cancellation after completion", async () => {
    const controller = new AbortController();
    const pending = openProcessStream("worker", "command", controller.signal);

    await vi.waitFor(() => expect(connection.connect).toHaveBeenCalledOnce());
    connection.emit("ready");
    const process = await pending;

    connection.channel.emit("exit", 0);
    connection.channel.emit("close");

    await expect(process.exit).resolves.toBe(0);
    controller.abort();

    expect(connection.end).toHaveBeenCalled();
    expect(connection.destroy).not.toHaveBeenCalled();
    expect(connection.channel.signal).not.toHaveBeenCalled();
  });

  it("keeps local commands working without an abort signal", async () => {
    const process = await openProcessStream(null, "printf existing-output");
    let stdout = "";

    process.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    await expect(process.exit).resolves.toBe(0);
    expect(stdout).toBe("existing-output");
  });

  it("terminates a local process on abort instead of leaving it running", async () => {
    const controller = new AbortController();
    const child = await openProcessStream(
      null,
      "exec sh -c 'echo $$; exec sleep 60'",
      controller.signal,
    );
    const [output] = await once(child.stdout, "data");
    const pid = Number(output.toString().trim());
    const exited = once(child.stdout, "close");
    const rejected = expect(child.exit).rejects.toMatchObject({ name: "AbortError" });

    controller.abort();
    await rejected;
    await exited;

    await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow());
  });
});

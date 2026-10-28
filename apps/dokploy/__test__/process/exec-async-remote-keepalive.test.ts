import { beforeEach, describe, expect, it, vi } from "vitest";

const { clients, FakeClient } = await vi.hoisted(async () => {
	const { EventEmitter } = await import("node:events");
	const clients: { connectConfig?: Record<string, unknown> }[] = [];
	class FakeClient extends EventEmitter {
		connectConfig: Record<string, unknown> | undefined;
		stream = Object.assign(new EventEmitter(), { stderr: new EventEmitter() });

		constructor() {
			super();
			clients.push(this);
		}

		connect(config: Record<string, unknown>) {
			this.connectConfig = config;
			setImmediate(() => this.emit("ready"));
			return this;
		}

		exec(
			_command: string,
			cb: (err: Error | undefined, stream: unknown) => void,
		) {
			cb(undefined, this.stream);
		}

		sftp() {}

		end() {}
	}
	return { clients: clients as FakeClient[], FakeClient };
});

vi.mock("ssh2", () => ({ Client: FakeClient }));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(async (serverId: string) => ({
		serverId,
		ipAddress: "10.0.0.1",
		port: 22,
		username: "root",
		sshKeyId: "key",
		sshKey: { privateKey: "private" },
	})),
}));

import {
	execAsyncRemote,
	sshKeepalive,
	writeFileRemote,
} from "@dokploy/server/utils/process/execAsync";
import { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";

describe("remote exec over SSH", () => {
	beforeEach(() => {
		clients.length = 0;
	});

	it("enables SSH keepalive so a dead host is detected", async () => {
		const pending = execAsyncRemote("server-1", "docker build .");
		await vi.waitFor(() => expect(clients[0]?.connectConfig).toBeDefined());
		const client = clients[0]!;

		expect(client.connectConfig).toMatchObject(sshKeepalive);

		client.stream.emit("close", 0);
		await expect(pending).resolves.toEqual({ stdout: "", stderr: "" });
	});

	it("rejects when the keepalive times out mid-command", async () => {
		const onData = vi.fn();
		const pending = execAsyncRemote("server-1", "docker build .", onData);
		await vi.waitFor(() => expect(clients[0]?.connectConfig).toBeDefined());

		const err = Object.assign(new Error("Keepalive timeout"), {
			level: "client-timeout",
		});
		clients[0]!.emit("error", err);

		await expect(pending).rejects.toThrow("Keepalive timeout");
		expect(onData).toHaveBeenCalledWith(
			"SSH connection error: Keepalive timeout",
		);
	});

	it("enables SSH keepalive for remote file writes", async () => {
		writeFileRemote("server-1", "/tmp/file", "content").catch(() => {});
		await vi.waitFor(() => expect(clients[0]?.connectConfig).toBeDefined());

		expect(clients[0]!.connectConfig).toMatchObject(sshKeepalive);
	});

	it("enables SSH keepalive for the remote Docker API", async () => {
		const remoteDocker = await getRemoteDocker("server-1");

		expect((remoteDocker.modem as any).sshOptions).toMatchObject(sshKeepalive);
	});
});

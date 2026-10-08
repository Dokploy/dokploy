import { getRemoteBuildCancelTarget } from "@dokploy/server/utils/builders/remote-build-cancel";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import {
	abortRemoteBuild,
	hasRunningRemoteBuild,
} from "@dokploy/server/utils/process/remote-build-registry";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ssh = vi.hoisted(() => ({
	clients: [] as any[],
	onExec: (_channel: any) => {},
}));

vi.mock("ssh2", async () => {
	const { EventEmitter } = await import("node:events");

	class FakeChannel extends EventEmitter {
		stderr = Object.assign(new EventEmitter(), { setEncoding: () => {} });
		setEncoding() {}
	}

	class Client extends EventEmitter {
		command = "";
		calls: string[] = [];
		connect() {
			ssh.clients.push(this);
			queueMicrotask(() => this.emit("ready"));
			return this;
		}
		exec(command: string, callback: (err: Error | undefined, ch: any) => void) {
			this.command = command;
			const channel = new FakeChannel();
			callback(undefined, channel);
			ssh.onExec(channel);
		}
		end() {
			this.calls.push("end");
			// A closed connection is how the registry entry is released.
			this.emit("close");
		}
		destroy() {
			this.calls.push("destroy");
			this.emit("close");
		}
	}

	return { Client };
});

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(async () => ({
		sshKeyId: "key-1",
		ipAddress: "10.0.0.2",
		port: 22,
		username: "root",
		sshKey: { privateKey: "PRIVATE KEY" },
	})),
}));

const tick = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
	ssh.clients = [];
	ssh.onExec = () => {};
});

describe("execAsyncRemote without a cancel target", () => {
	it("sends the command byte for byte and registers nothing", async () => {
		ssh.onExec = (channel) =>
			queueMicrotask(() => channel.emit("close", 0));
		const command = `docker build -t app . && echo 'it"s $HOME'`;

		await execAsyncRemote("server-1", command);

		expect(ssh.clients).toHaveLength(1);
		expect(ssh.clients[0].command).toBe(command);
		expect(hasRunningRemoteBuild("dep-plain")).toBe(false);
	});
});

describe("execAsyncRemote with a cancel target", () => {
	const target = getRemoteBuildCancelTarget("dep-1");

	it("runs the build in its own session behind a per-deployment pid file", async () => {
		ssh.onExec = (channel) =>
			queueMicrotask(() => channel.emit("close", 0));

		await execAsyncRemote("server-1", "docker build -t app .", undefined, {
			cancelable: target,
		});

		const sent: string = ssh.clients[0].command;
		expect(sent).toContain("setsid");
		expect(sent).toContain(target.pidFile);
		expect(sent).toContain("'docker build -t app .'");
		expect(sent).not.toBe("docker build -t app .");
	});

	it("is registered while it runs and released once the connection closes", async () => {
		let finish = () => {};
		ssh.onExec = (channel) => {
			finish = () => channel.emit("close", 0);
		};

		const running = execAsyncRemote("server-1", "build", undefined, {
			cancelable: target,
		});
		await tick();
		expect(hasRunningRemoteBuild("dep-1")).toBe(true);

		finish();
		await running;
		expect(hasRunningRemoteBuild("dep-1")).toBe(false);
	});

	it("rejects and drops the connection when the deployment is cancelled", async () => {
		ssh.onExec = () => {};

		const running = execAsyncRemote("server-1", "build", undefined, {
			cancelable: target,
		});
		const outcome = running.catch((error) => error);
		await tick();

		abortRemoteBuild("dep-1", "cancelled by user");

		const error = await outcome;
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toContain("Remote build was cancelled");
		expect(error.message).toContain("cancelled by user");
		expect(ssh.clients[0].calls).toContain("destroy");
		expect(hasRunningRemoteBuild("dep-1")).toBe(false);
	});

	it("only aborts the cancelled deployment, not a concurrent one", async () => {
		ssh.onExec = () => {};
		const other = getRemoteBuildCancelTarget("dep-2");

		const first = execAsyncRemote("server-1", "build", undefined, {
			cancelable: target,
		}).catch((error) => error);
		const second = execAsyncRemote("server-1", "build", undefined, {
			cancelable: other,
		}).catch((error) => error);
		await tick();

		abortRemoteBuild("dep-1", "cancelled by user");
		await first;

		expect(hasRunningRemoteBuild("dep-1")).toBe(false);
		expect(hasRunningRemoteBuild("dep-2")).toBe(true);
		expect(ssh.clients[1].calls).not.toContain("destroy");

		abortRemoteBuild("dep-2", "test cleanup");
		await second;
	});
});

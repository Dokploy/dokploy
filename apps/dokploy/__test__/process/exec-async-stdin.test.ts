import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for ssh2: the channel records what is written to it, and closes
// with the exit status the test asks for.
const ssh = vi.hoisted(() => ({
	clients: [] as any[],
	exitCode: 0,
}));

vi.mock("ssh2", async () => {
	const { EventEmitter } = await import("node:events");

	class FakeChannel extends EventEmitter {
		stderr = new EventEmitter();
		written: string[] = [];
		ended = false;
		write(data: string) {
			this.written.push(data);
			return true;
		}
		end() {
			this.ended = true;
			queueMicrotask(() => this.emit("close", ssh.exitCode));
		}
	}

	class Client extends EventEmitter {
		command = "";
		channel: FakeChannel | null = null;
		connect() {
			ssh.clients.push(this);
			queueMicrotask(() => this.emit("ready"));
			return this;
		}
		exec(command: string, callback: (err: Error | undefined, ch: any) => void) {
			this.command = command;
			this.channel = new FakeChannel();
			callback(undefined, this.channel);
			// A command that takes no stdin finishes on its own.
			if (!/--password-stdin/.test(command)) {
				queueMicrotask(() => this.channel?.emit("close", ssh.exitCode));
			}
		}
		end() {}
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

const SECRET = "hunter2-S3cret";
const LOGIN = "docker login 'registry.example.com' -u 'acme' --password-stdin";

describe("execAsync stdin", () => {
	it("writes the stdin option to the command, not to its command line", async () => {
		const { stdout } = await execAsync(
			`node -e "process.stdin.pipe(process.stdout)"`,
			{ stdin: SECRET },
		);
		expect(stdout).toBe(SECRET);
	});

	it("does not fail when the command exits without reading its stdin", async () => {
		await expect(
			execAsync(`node -e "process.exit(0)"`, { stdin: "x".repeat(1 << 20) }),
		).resolves.toBeDefined();
	});

	it("still reports the command's failure", async () => {
		await expect(
			execAsync(`node -e "process.exit(3)"`, { stdin: SECRET }),
		).rejects.toThrow("Command execution failed");
	});
});

describe("execAsyncRemote stdin", () => {
	beforeEach(() => {
		ssh.clients.length = 0;
		ssh.exitCode = 0;
	});

	it("sends the secret over the channel and closes it, not in the command", async () => {
		await execAsyncRemote("srv-1", LOGIN, undefined, { stdin: SECRET });

		const [client] = ssh.clients;
		expect(client.command).toBe(LOGIN);
		expect(client.command).not.toContain(SECRET);
		expect(client.channel.written).toEqual([SECRET]);
		expect(client.channel.ended).toBe(true);
	});

	it("leaves stdin alone when no stdin is given", async () => {
		await execAsyncRemote("srv-1", "echo hi");

		const [client] = ssh.clients;
		expect(client.channel.written).toEqual([]);
		expect(client.channel.ended).toBe(false);
	});

	it("rejects with the exit code, without the secret in the error", async () => {
		ssh.exitCode = 1;
		const error = await execAsyncRemote("srv-1", LOGIN, undefined, {
			stdin: SECRET,
		}).catch((e: Error) => e);

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toContain("exit code 1");
		expect((error as Error).message).not.toContain(SECRET);
	});
});

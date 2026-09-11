import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findServerById } from "@dokploy/server/services/server";
import {
	ExecError,
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ssh, MockClient } = vi.hoisted(() => {
	class MockStream {
		close = vi.fn(() => {
			this.closed = true;
		});
		destroy = vi.fn(() => {
			this.destroyed = true;
		});
		closed = false;
		destroyed = false;
		handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

		on(event: string, cb: (...args: unknown[]) => void) {
			if (!this.handlers[event]) this.handlers[event] = [];
			this.handlers[event].push(cb);
			return this;
		}

		stderr = {
			on: (_event: string, _cb: (...args: unknown[]) => void) => this,
		};

		emitClose(code: number) {
			for (const cb of this.handlers.close ?? []) cb(code, null);
		}

		emitData(data: string) {
			for (const cb of this.handlers.data ?? []) cb(data);
		}
	}

	class MockClient {
		ended = false;
		destroyed = false;
		execCommand = "";
		execShouldFail: Error | null = null;
		stream = new MockStream();
		end = vi.fn(() => {
			this.ended = true;
		});
		destroy = vi.fn(() => {
			this.destroyed = true;
		});
		handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

		constructor() {
			ssh.instances.push(this);
		}

		once(event: string, cb: (...args: unknown[]) => void) {
			if (!this.handlers[event]) this.handlers[event] = [];
			this.handlers[event].push(cb);
			return this;
		}

		on(event: string, cb: (...args: unknown[]) => void) {
			return this.once(event, cb);
		}

		connect() {
			return this;
		}

		exec(command: string, cb: (err: Error | null, stream: MockStream) => void) {
			this.execCommand = command;
			if (this.execShouldFail) {
				cb(this.execShouldFail, this.stream);
				return;
			}
			cb(null, this.stream);
		}

		emitReady() {
			for (const cb of this.handlers.ready ?? []) cb();
		}

		emitError(err: Error & { level?: string }) {
			for (const cb of this.handlers.error ?? []) cb(err);
		}
	}

	const ssh = { instances: [] as MockClient[] };
	return { ssh, MockClient };
});

vi.mock("ssh2", () => ({
	Client: MockClient,
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
}));

const pidAlive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

const readPid = (file: string) => Number(readFileSync(file, "utf8").trim());

describe("execAsync timeout", () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const dir of dirs) {
			rmSync(dir, { recursive: true, force: true });
		}
		dirs.length = 0;
	});

	it("does not apply a timeout unless one is requested", async () => {
		const result = await execAsync("printf ok");
		expect(result.stdout).toContain("ok");
	});

	it("rejects a hanging local command and kills the process group", async () => {
		const dir = mkdtempSync(path.join(tmpdir(), "dokploy-exec-timeout-"));
		dirs.push(dir);
		const shellPidFile = path.join(dir, "shell.pid");
		const sleepPidFile = path.join(dir, "sleep.pid");
		const started = Date.now();
		const command = `echo $$ > "${shellPidFile}"; sleep 30 & echo $! > "${sleepPidFile}"; wait`;

		await expect(execAsync(command, { timeout: 300 })).rejects.toSatisfy(
			(error: unknown) =>
				error instanceof ExecError &&
				/timed out after 300ms/.test(error.message),
		);
		expect(Date.now() - started).toBeLessThan(2000);

		await vi.waitFor(
			() => {
				expect(pidAlive(readPid(shellPidFile))).toBe(false);
				expect(pidAlive(readPid(sleepPidFile))).toBe(false);
			},
			{ timeout: 2000, interval: 50 },
		);
	});

	it("rejects nonzero exit before the timeout without treating it as a hang", async () => {
		await expect(execAsync("exit 7", { timeout: 2000 })).rejects.toSatisfy(
			(error: unknown) =>
				error instanceof ExecError &&
				!/timed out/.test(error.message) &&
				error.exitCode === 7,
		);
	});
});

describe("execAsyncRemote timeout", () => {
	const server = {
		sshKeyId: "key-1",
		ipAddress: "203.0.113.10",
		port: 22,
		username: "root",
		sshKey: { privateKey: "fake-key" },
	};

	beforeEach(() => {
		ssh.instances.length = 0;
		vi.mocked(findServerById).mockReset();
		vi.mocked(findServerById).mockResolvedValue(server as never);
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	const flush = () => Promise.resolve();

	const startRemote = (onData?: (data: string) => void, timeout = 1000) =>
		execAsyncRemote("server-1", "nvidia-smi", onData, { timeout });

	it("times out before ready and closes the SSH client", async () => {
		const pending = startRemote();
		const rejected = expect(pending).rejects.toSatisfy(
			(error: unknown) =>
				error instanceof ExecError &&
				/timed out after 1000ms/.test(error.message),
		);
		await flush();
		const client = ssh.instances[0];
		expect(client).toBeDefined();
		await vi.advanceTimersByTimeAsync(1000);
		await rejected;
		expect(client?.stream.close).not.toHaveBeenCalled();
		expect(client?.end).toHaveBeenCalled();
	});

	it("times out after the stream exists and closes stream plus client", async () => {
		const pending = startRemote();
		const rejected = expect(pending).rejects.toMatchObject({
			name: "ExecError",
		});
		await flush();
		const client = ssh.instances[0];
		client?.emitReady();
		expect(client?.execCommand).toBe("nvidia-smi");
		await vi.advanceTimersByTimeAsync(1000);
		await rejected;
		expect(client?.stream.close).toHaveBeenCalledTimes(1);
		expect(client?.end).toHaveBeenCalledTimes(1);
		client?.stream.emitClose(0);
		expect(client?.end).toHaveBeenCalledTimes(1);
	});

	it("clears the timeout timer after a successful remote command", async () => {
		const pending = startRemote(undefined, 5000);
		await flush();
		expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1);
		const client = ssh.instances[0];
		client?.emitReady();
		const timersBeforeClose = vi.getTimerCount();
		client?.stream.emitClose(0);
		await expect(pending).resolves.toEqual({ stdout: "", stderr: "" });
		expect(vi.getTimerCount()).toBeLessThan(timersBeforeClose);
	});

	it("resolves on success and does not reject later when the timer would have fired", async () => {
		const rejections: unknown[] = [];
		const onUnhandled = (reason: unknown) => {
			rejections.push(reason);
		};
		process.on("unhandledRejection", onUnhandled);

		const pending = startRemote(undefined, 5000);
		await flush();
		const client = ssh.instances[0];
		client?.emitReady();
		client?.stream.emitClose(0);
		await expect(pending).resolves.toEqual({ stdout: "", stderr: "" });
		await vi.advanceTimersByTimeAsync(10_000);
		process.off("unhandledRejection", onUnhandled);
		expect(rejections).toEqual([]);
		expect(client?.ended).toBe(true);
	});

	it("settles only once when close and timeout race", async () => {
		const pending = startRemote();
		await flush();
		const client = ssh.instances[0];
		client?.emitReady();
		client?.stream.emitClose(0);
		await vi.advanceTimersByTimeAsync(1000);
		await expect(pending).resolves.toEqual({ stdout: "", stderr: "" });
	});

	it("rejects SSH errors before timeout and ignores the later timer", async () => {
		const rejections: unknown[] = [];
		const onUnhandled = (reason: unknown) => {
			rejections.push(reason);
		};
		process.on("unhandledRejection", onUnhandled);

		const pending = startRemote();
		const rejected = expect(pending).rejects.toSatisfy(
			(error: unknown) =>
				error instanceof ExecError &&
				error.message.includes("SSH connection error"),
		);
		await flush();
		const client = ssh.instances[0];
		client?.emitError(
			Object.assign(new Error("offline"), { level: "client-socket" }),
		);
		await rejected;
		await vi.advanceTimersByTimeAsync(1000);
		process.off("unhandledRejection", onUnhandled);
		expect(rejections).toEqual([]);
		expect(client?.end).toHaveBeenCalled();
	});

	it("rejects exec callback errors before timeout", async () => {
		const pending = startRemote();
		const rejected = expect(pending).rejects.toSatisfy(
			(error: unknown) =>
				error instanceof ExecError &&
				error.message.includes("Remote command execution failed"),
		);
		await flush();
		const client = ssh.instances[0];
		if (client) client.execShouldFail = new Error("cannot exec");
		client?.emitReady();
		await rejected;
		await vi.advanceTimersByTimeAsync(1000);
		expect(client?.end).toHaveBeenCalled();
	});

	it("still delivers onData chunks if the command hangs afterward", async () => {
		const chunks: string[] = [];
		const pending = startRemote((data) => {
			chunks.push(data);
		});
		const rejected = expect(pending).rejects.toMatchObject({
			name: "ExecError",
		});
		await flush();
		const client = ssh.instances[0];
		client?.emitReady();
		client?.stream.emitData("partial");
		await vi.advanceTimersByTimeAsync(1000);
		await rejected;
		expect(chunks).toEqual(["partial"]);
		expect(client?.stream.close).toHaveBeenCalled();
		expect(client?.end).toHaveBeenCalled();
	});
});

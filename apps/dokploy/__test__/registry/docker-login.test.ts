import { EventEmitter } from "node:events";
import { Duplex, PassThrough, Writable } from "node:stream";
import { inspect } from "node:util";
import { dockerLogin } from "@dokploy/server/services/registry";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { parse } from "shell-quote";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	exec: vi.fn(),
	execFile: vi.fn(),
	remoteExec: vi.fn(),
	end: vi.fn(),
}));

vi.mock("node:child_process", async () => {
	const { promisify } = await import("node:util");
	return {
		exec: Object.assign(mocks.exec, {
			[promisify.custom]: (command: string) =>
				new Promise((resolve, reject) => {
					mocks.exec(
						command,
						(error: Error | null, stdout: string, stderr: string) => {
							if (error) reject(Object.assign(error, { stdout, stderr }));
							else resolve({ stdout, stderr });
						},
					);
				}),
		}),
		execFile: mocks.execFile,
	};
});
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(async () => ({ sshKeyId: "test-key" })),
}));
vi.mock("ssh2", async () => {
	const { EventEmitter } = await import("node:events");
	return {
		Client: class extends EventEmitter {
			exec = mocks.remoteExec;
			end = mocks.end;
			connect() {
				queueMicrotask(() => this.emit("ready"));
				return this;
			}
		},
	};
});

const password = "fixture'\";$(false)\nsecret";
const registryUrl = "registry.example.com; false";
const username = "user'$(false)";
let localInput: string;
let remoteInput: string;
let localStdin: Writable;
let remoteStream: Duplex & { stderr: PassThrough };
let exitCode: number;
let stdout: string;
let stderr: string;

beforeEach(() => {
	vi.clearAllMocks();
	localInput = "";
	remoteInput = "";
	exitCode = 0;
	stdout = "Login Succeeded";
	stderr = "";

	mocks.exec.mockImplementation((command, ...args) => {
		const callback = args.at(-1);
		queueMicrotask(() => {
			callback(
				exitCode === 0
					? null
					: Object.assign(new Error(`Command failed: ${command}`), {
							code: exitCode,
						}),
				stdout,
				stderr,
			);
		});
	});
	mocks.execFile.mockImplementation(() => {
		const child = Object.assign(new EventEmitter(), {
			stdout: new PassThrough(),
			stderr: new PassThrough(),
			stdin: new Writable({
				write(chunk, _encoding, callback) {
					localInput += chunk.toString();
					callback();
				},
			}),
		});
		localStdin = child.stdin;
		queueMicrotask(() => {
			child.stdout.write(stdout);
			child.stderr.write(stderr);
			child.emit("close", exitCode);
		});
		return child;
	});
	mocks.remoteExec.mockImplementation((_command, callback) => {
		remoteStream = Object.assign(
			new Duplex({
				read() {},
				write(chunk, _encoding, done) {
					remoteInput += chunk.toString();
					done();
				},
			}),
			{ stderr: new PassThrough() },
		);
		callback(null, remoteStream);
		queueMicrotask(() => {
			remoteStream.emit("data", stdout);
			remoteStream.stderr.write(stderr);
			remoteStream.emit("close", exitCode);
		});
	});
});

describe("docker login credentials", () => {
	it("passes local credentials only on stdin, without a shell", async () => {
		await dockerLogin(registryUrl, username, password);

		expect(mocks.exec).not.toHaveBeenCalled();
		expect(mocks.execFile).toHaveBeenCalledExactlyOnceWith("docker", [
			"login",
			registryUrl,
			"--username",
			username,
			"--password-stdin",
		]);
		expect(localInput).toBe(password);
		expect(localStdin.writableEnded).toBe(true);
	});

	it("escapes remote arguments and sends the password only on stream stdin", async () => {
		await dockerLogin(registryUrl, username, password, "test-server");

		const command = mocks.remoteExec.mock.calls[0]?.[0];
		expect(command).not.toContain(password);
		expect(parse(command)).toEqual([
			"docker",
			"login",
			registryUrl,
			"--username",
			username,
			"--password-stdin",
		]);
		expect(remoteInput).toBe(password);
		expect(remoteStream.writableEnded).toBe(true);
		expect(mocks.end).toHaveBeenCalledOnce();
	});

	it("ends local stdin even for an empty password", async () => {
		await dockerLogin("", "user", "");

		expect(localInput).toBe("");
		expect(localStdin.writableEnded).toBe(true);
	});

	it("keeps remote execution without input unchanged", async () => {
		const onData = vi.fn();
		stderr = "warning";

		await expect(
			execAsyncRemote("test-server", "echo hello", onData),
		).resolves.toEqual({
			stdout,
			stderr,
		});
		expect(remoteStream.writableEnded).toBe(false);
		expect(onData.mock.calls).toEqual([[stdout], [stderr]]);
	});

	it.each([undefined, "test-server"])(
		"does not retain passwords echoed by a failed login on %s",
		async (serverId) => {
			exitCode = 1;
			stdout = `stdout: ${password}`;
			stderr = `denied: ${password}`;

			const error = await dockerLogin(
				registryUrl,
				username,
				password,
				serverId,
			).catch((error: unknown) => error);

			expect(error).toBeInstanceOf(Error);
			expect(error).toHaveProperty(
				"message",
				expect.not.stringContaining(password),
			);
			expect(inspect(error, { depth: null })).not.toContain(password);
			expect(JSON.stringify(error)).not.toContain(
				JSON.stringify(password).slice(1, -1),
			);
			expect(error).not.toHaveProperty("originalError");
			expect(error).not.toHaveProperty("cause");
		},
	);
});

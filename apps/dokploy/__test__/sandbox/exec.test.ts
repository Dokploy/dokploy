import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
	buildSandboxKillCommand,
	runSandboxExec,
	SANDBOX_EXEC_MARKER_ENV,
	SANDBOX_EXEC_TIMEOUT_EXIT_CODE,
	toSandboxEnvArray,
} from "@dokploy/server/utils/sandbox/exec";
import { parse, quote } from "shell-quote";
import { describe, expect, it, vi } from "vitest";

// Docker multiplexes stdout/stderr on a non-tty exec as 8-byte frames:
// [stream type, 0, 0, 0, size (BE uint32)] followed by the payload.
const frame = (type: 1 | 2, text: string) => {
	const payload = Buffer.from(text);
	const header = Buffer.alloc(8);
	header[0] = type;
	header.writeUInt32BE(payload.length, 4);
	return Buffer.concat([header, payload]);
};

// Mirrors docker-modem's demuxStream so the runner is exercised end to end.
const demuxStream = (
	stream: NodeJS.ReadableStream,
	stdout: NodeJS.WritableStream,
	stderr: NodeJS.WritableStream,
) => {
	let buffer = Buffer.alloc(0);
	stream.on("data", (chunk: Buffer) => {
		buffer = Buffer.concat([buffer, chunk]);
		while (buffer.length >= 8) {
			const size = buffer.readUInt32BE(4);
			if (buffer.length < 8 + size) break;
			const payload = buffer.subarray(8, 8 + size);
			(buffer[0] === 2 ? stderr : stdout).write(payload);
			buffer = buffer.subarray(8 + size);
		}
	});
};

const createDocker = (opts: {
	frames: Buffer[];
	exitCode: number | null;
	endAfterMs?: number;
	dieOnKill?: boolean;
}) => {
	const stream = new PassThrough();
	const execCreate = vi.fn();
	const execStart = vi.fn();
	const kill = vi.fn(async () => {
		stream.end();
	});
	const killExecStart = vi.fn(async () => {
		if (opts.dieOnKill) stream.end();
	});
	const inspect = vi.fn(async () => ({ ExitCode: opts.exitCode }));

	const exec = vi.fn(async (options: { Cmd: string[] }) => {
		execCreate(options);
		if (options.Cmd[2]?.startsWith("for p in /proc/")) {
			return { start: killExecStart, inspect };
		}
		return {
			start: vi.fn(async (startOptions: unknown) => {
				execStart(startOptions);
				setTimeout(() => {
					for (const chunk of opts.frames) stream.write(chunk);
					if (opts.endAfterMs === undefined) stream.end();
					else if (opts.endAfterMs > 0)
						setTimeout(() => stream.end(), opts.endAfterMs);
				}, 5);
				return stream;
			}),
			inspect,
		};
	});

	const docker = {
		getContainer: vi.fn(() => ({ exec, kill })),
		modem: { demuxStream },
	};
	return { docker, execCreate, execStart, kill, killExecStart, inspect };
};

describe("runSandboxExec", () => {
	it("demuxes stdout/stderr and reports the exit code", async () => {
		const { docker, execCreate, execStart } = createDocker({
			frames: [frame(1, "hello "), frame(1, "world\n"), frame(2, "oops\n")],
			exitCode: 3,
		});
		const stdoutChunks: string[] = [];
		const result = await runSandboxExec(docker as never, "ctr", {
			cmd: "echo hello world; echo oops >&2; exit 3",
			cwd: "/home/user",
			env: { FOO: "bar" },
			timeoutMs: 5000,
			onStdout: (chunk) => stdoutChunks.push(chunk),
		});

		expect(result).toMatchObject({
			stdout: "hello world\n",
			stderr: "oops\n",
			exitCode: 3,
			timedOut: false,
			truncated: false,
			containerKilled: false,
		});
		expect(stdoutChunks.join("")).toBe("hello world\n");

		const options = execCreate.mock.calls[0]?.[0];
		expect(options.Cmd).toEqual([
			"sh",
			"-c",
			"echo hello world; echo oops >&2; exit 3",
		]);
		expect(options.WorkingDir).toBe("/home/user");
		expect(options.Tty).toBe(false);
		expect(options.Env).toContain("FOO=bar");
		expect(
			options.Env.some((e: string) =>
				e.startsWith(`${SANDBOX_EXEC_MARKER_ENV}=`),
			),
		).toBe(true);
		expect(execStart).toHaveBeenCalledWith({ hijack: true, stdin: false });
	});

	it("treats a null exit code as failure", async () => {
		const { docker } = createDocker({ frames: [], exitCode: null });
		const result = await runSandboxExec(docker as never, "ctr", {
			cmd: "true",
			timeoutMs: 5000,
		});
		expect(result.exitCode).toBe(1);
	});

	it("truncates output beyond maxOutputBytes but keeps streaming", async () => {
		const { docker } = createDocker({
			frames: [frame(1, "a".repeat(100)), frame(1, "b".repeat(100))],
			exitCode: 0,
		});
		const streamed: string[] = [];
		const result = await runSandboxExec(docker as never, "ctr", {
			cmd: "yes",
			timeoutMs: 5000,
			maxOutputBytes: 150,
			onStdout: (chunk) => streamed.push(chunk),
		});
		expect(result.stdout).toHaveLength(150);
		expect(result.truncated).toBe(true);
		expect(streamed.join("")).toHaveLength(200);
	});

	it("kills the process on timeout and returns exit code 124", async () => {
		const { docker, killExecStart, kill } = createDocker({
			frames: [frame(1, "partial")],
			exitCode: 0,
			endAfterMs: 0,
			dieOnKill: true,
		});
		const result = await runSandboxExec(docker as never, "ctr", {
			cmd: "sleep 100",
			timeoutMs: 50,
		});
		expect(result.timedOut).toBe(true);
		expect(result.exitCode).toBe(SANDBOX_EXEC_TIMEOUT_EXIT_CODE);
		expect(result.stdout).toBe("partial");
		expect(killExecStart).toHaveBeenCalledWith({ Detach: true });
		expect(kill).not.toHaveBeenCalled();
		expect(result.containerKilled).toBe(false);
	});

	it("kills the container when the process survives the marker kill", async () => {
		const { docker, kill } = createDocker({
			frames: [],
			exitCode: 0,
			endAfterMs: 0,
			dieOnKill: false,
		});
		const result = await runSandboxExec(docker as never, "ctr", {
			cmd: "sleep 100",
			timeoutMs: 50,
		});
		expect(result.timedOut).toBe(true);
		expect(result.exitCode).toBe(SANDBOX_EXEC_TIMEOUT_EXIT_CODE);
		expect(kill).toHaveBeenCalledWith({ signal: "SIGKILL" });
		expect(result.containerKilled).toBe(true);
	}, 10_000);
});

describe("buildSandboxKillCommand", () => {
	it("matches the marker as a fixed string and never fails the shell", () => {
		const cmd = buildSandboxKillCommand("abc-123");
		expect(cmd).toContain(`grep -qxF ${quote(["DOKPLOY_EXEC_ID=abc-123"])}`);
		expect(parse(cmd)).toContain("DOKPLOY_EXEC_ID=abc-123");
		expect(cmd).toContain("kill -9");
		expect(cmd.endsWith("; true")).toBe(true);
	});
});

describe("toSandboxEnvArray", () => {
	it("converts records and passes arrays through", () => {
		expect(toSandboxEnvArray({ A: "1", B: "x=y" })).toEqual(["A=1", "B=x=y"]);
		expect(toSandboxEnvArray(["C=3"])).toEqual(["C=3"]);
		expect(toSandboxEnvArray(undefined)).toEqual([]);
	});
});

describe("EventEmitter sanity", () => {
	it("keeps the fake stream API compatible with what the runner uses", () => {
		expect(new PassThrough()).toBeInstanceOf(EventEmitter);
	});
});

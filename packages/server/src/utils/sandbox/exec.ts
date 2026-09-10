import { Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type Dockerode from "dockerode";
import { nanoid } from "nanoid";
import { quote } from "shell-quote";

export const SANDBOX_EXEC_TIMEOUT_EXIT_CODE = 124;
export const SANDBOX_EXEC_MARKER_ENV = "DOKPLOY_EXEC_ID";
export const SANDBOX_EXEC_MAX_OUTPUT_BYTES = 1024 * 1024;
const KILL_GRACE_MS = 2000;

export interface SandboxExecOptions {
	cmd: string;
	cwd?: string;
	env?: Record<string, string> | string[];
	user?: string;
	timeoutMs: number;
	maxOutputBytes?: number;
	onStdout?: (chunk: string) => void;
	onStderr?: (chunk: string) => void;
}

export interface SandboxExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	timedOut: boolean;
	truncated: boolean;
	containerKilled: boolean;
}

export const toSandboxEnvArray = (env?: Record<string, string> | string[]) =>
	Array.isArray(env)
		? env
		: Object.entries(env ?? {}).map(([key, value]) => `${key}=${value}`);

// Finds every process started by the exec (children included) through the
// marker env var and kills it, without relying on pkill/procps being installed.
export const buildSandboxKillCommand = (marker: string) =>
	`for p in /proc/[0-9]*; do if tr '\\0' '\\n' < "$p/environ" 2>/dev/null | grep -qxF ${quote([`${SANDBOX_EXEC_MARKER_ENV}=${marker}`])}; then kill -9 "\${p#/proc/}" 2>/dev/null; fi; done; true`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createSink = (
	maxBytes: number,
	onChunk: ((chunk: string) => void) | undefined,
	state: { truncated: boolean },
) => {
	const chunks: Buffer[] = [];
	const decoder = new StringDecoder("utf8");
	let bytes = 0;
	const sink = new Writable({
		write(chunk: Buffer, _encoding, next) {
			onChunk?.(decoder.write(chunk));
			if (bytes < maxBytes) {
				const slice = chunk.subarray(0, maxBytes - bytes);
				chunks.push(slice);
				bytes += slice.length;
				if (slice.length < chunk.length) state.truncated = true;
			} else {
				state.truncated = true;
			}
			next();
		},
	});
	return { sink, text: () => Buffer.concat(chunks).toString("utf8") };
};

const killByMarker = async (
	docker: Dockerode,
	containerId: string,
	marker: string,
) => {
	const exec = await docker.getContainer(containerId).exec({
		Cmd: ["sh", "-c", buildSandboxKillCommand(marker)],
		AttachStdout: false,
		AttachStderr: false,
	});
	await exec.start({ Detach: true });
};

export const runSandboxExec = async (
	docker: Dockerode,
	containerId: string,
	options: SandboxExecOptions,
): Promise<SandboxExecResult> => {
	const container = docker.getContainer(containerId);
	const marker = nanoid();
	const exec = await container.exec({
		Cmd: ["sh", "-c", options.cmd],
		AttachStdout: true,
		AttachStderr: true,
		Tty: false,
		WorkingDir: options.cwd,
		Env: [
			...toSandboxEnvArray(options.env),
			`${SANDBOX_EXEC_MARKER_ENV}=${marker}`,
		],
		...(options.user ? { User: options.user } : {}),
	});
	const stream = await exec.start({ hijack: true, stdin: false });

	const maxBytes = options.maxOutputBytes ?? SANDBOX_EXEC_MAX_OUTPUT_BYTES;
	const state = { truncated: false };
	const stdout = createSink(maxBytes, options.onStdout, state);
	const stderr = createSink(maxBytes, options.onStderr, state);

	const finished = new Promise<void>((resolve, reject) => {
		stream.once("end", resolve);
		stream.once("close", resolve);
		stream.once("error", reject);
	});
	docker.modem.demuxStream(stream, stdout.sink, stderr.sink);

	let timedOut = false;
	let containerKilled = false;
	let timeoutTask: Promise<void> | null = null;
	const timer = setTimeout(() => {
		timedOut = true;
		timeoutTask = (async () => {
			await killByMarker(docker, containerId, marker).catch(() => {});
			const ended = await Promise.race([
				finished.then(
					() => true,
					() => true,
				),
				sleep(KILL_GRACE_MS).then(() => false),
			]);
			if (!ended) {
				await container
					.kill({ signal: "SIGKILL" })
					.then(() => {
						containerKilled = true;
					})
					.catch(() => {});
				stream.destroy();
			}
		})();
	}, options.timeoutMs);

	try {
		await finished;
	} finally {
		clearTimeout(timer);
	}
	if (timeoutTask) await timeoutTask;

	let exitCode = SANDBOX_EXEC_TIMEOUT_EXIT_CODE;
	if (!timedOut) {
		const info = await exec.inspect();
		exitCode = info.ExitCode ?? 1;
	}

	return {
		stdout: stdout.text(),
		stderr: stderr.text(),
		exitCode,
		timedOut,
		truncated: state.truncated,
		containerKilled,
	};
};

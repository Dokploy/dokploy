import { Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type Dockerode from "dockerode";
import { nanoid } from "nanoid";

export const SANDBOX_EXEC_TIMEOUT_EXIT_CODE = 124;
export const SANDBOX_EXEC_MARKER_ENV = "DOKPLOY_EXEC_ID";
export const SANDBOX_EXEC_MAX_OUTPUT_BYTES = 1024 * 1024;
export const SANDBOX_EXEC_KILL_GRACE_MS = 2000;

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

export const getSandboxKillMarker = (marker: string) => `kill-${marker}`;

export const buildSandboxKillCommand = (marker: string) => {
	const name = SANDBOX_EXEC_MARKER_ENV;
	return [
		"n=$(printf '\\nx'); n=${n%x}",
		"for f in /proc/[0-9]*/environ; do",
		"e=$(tr '\\0' '\\n' < \"$f\" 2>/dev/null) || continue",
		`case "$n$e$n" in *"\${n}${name}=${marker}\${n}"*) ;; *"\${n}${name}="*) continue ;; esac`,
		'p=${f#/proc/}; kill -9 "${p%/environ}" 2>/dev/null',
		"done; true",
	].join("\n");
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createSandboxOutputSink = (
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
	user?: string,
) => {
	const exec = await docker.getContainer(containerId).exec({
		Cmd: ["sh", "-c", buildSandboxKillCommand(marker)],
		Env: [`${SANDBOX_EXEC_MARKER_ENV}=${getSandboxKillMarker(marker)}`],
		AttachStdout: false,
		AttachStderr: false,
		...(user ? { User: user } : {}),
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
	const stdout = createSandboxOutputSink(maxBytes, options.onStdout, state);
	const stderr = createSandboxOutputSink(maxBytes, options.onStderr, state);

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
			await killByMarker(docker, containerId, marker, options.user).catch(
				() => {},
			);
			const ended = await Promise.race([
				finished.then(
					() => true,
					() => true,
				),
				sleep(SANDBOX_EXEC_KILL_GRACE_MS).then(() => false),
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

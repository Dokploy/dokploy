import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { findServerById } from "@dokploy/server/services/server";
import { Client } from "ssh2";

/**
 * Maximum number of stderr bytes kept in memory per command channel. This is
 * only used to surface a useful error message when a transfer command fails;
 * it is bounded and unrelated to the (unbounded) binary payload that flows
 * through `stdout`/`stdin`, which is never buffered.
 */
const MAX_STDERR_BYTES = 64 * 1024;

/**
 * SSH keepalive settings for long-running transfer channels. Large volumes
 * can take a long time to stream; without keepalives an idle-looking
 * connection (the remote side is busy writing to disk, not sending data)
 * can be dropped by NAT/firewalls. There is no overall command timeout here
 * on purpose - the transfer duration depends entirely on data size.
 */
const SSH_KEEPALIVE_INTERVAL_MS = 10_000;
const SSH_KEEPALIVE_COUNT_MAX = 30;

export class CommandChannelError extends Error {
	constructor(
		message: string,
		public readonly command: string,
		public readonly exitCode: number | null,
		public readonly stderr: string,
	) {
		super(message);
		this.name = "CommandChannelError";
	}
}

export interface CommandChannel {
	/** Writable end that is piped INTO the remote/local command's stdin. */
	readonly stdin: Writable;
	/** Readable end that streams OUT of the remote/local command's stdout. */
	readonly stdout: Readable;
	/** Resolves with the command's exit code once the process/channel closes. */
	waitForExit(): Promise<number | null>;
	/** Bounded, best-effort capture of stderr text for error reporting. */
	getStderr(): string;
	/** Releases underlying resources (child process / ssh connection). */
	dispose(): void;
}

const capStderr = (chunks: Buffer[], totalLength: number) => {
	let remaining = totalLength;
	while (remaining > MAX_STDERR_BYTES && chunks.length > 0) {
		const first = chunks[0];
		if (!first) break;
		remaining -= first.length;
		chunks.shift();
	}
	return remaining;
};

const openLocalCommandChannel = (
	command: string,
	options: { cwd?: string } = {},
): CommandChannel => {
	const child = spawn(command, {
		shell: "/bin/bash",
		cwd: options.cwd,
	});

	const stderrChunks: Buffer[] = [];
	let stderrLength = 0;
	child.stderr?.on("data", (chunk: Buffer) => {
		stderrChunks.push(chunk);
		stderrLength += chunk.length;
		stderrLength = capStderr(stderrChunks, stderrLength);
	});

	const exitPromise = new Promise<number | null>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => resolve(code));
	});

	return {
		stdin: child.stdin,
		stdout: child.stdout,
		waitForExit: () => exitPromise,
		getStderr: () => Buffer.concat(stderrChunks).toString("utf8"),
		dispose: () => {
			child.stdin?.destroy();
			child.stdout?.destroy();
			child.stderr?.destroy();
			if (!child.killed) {
				child.kill();
			}
		},
	};
};

const openRemoteCommandChannel = async (
	serverId: string,
	command: string,
): Promise<CommandChannel> => {
	const server = await findServerById(serverId);
	if (!server.sshKeyId) {
		throw new Error("No SSH key available for this server");
	}

	const conn = new Client();

	return await new Promise<CommandChannel>((resolve, reject) => {
		conn
			.once("ready", () => {
				conn.exec(command, (err, stream) => {
					if (err) {
						conn.end();
						reject(err);
						return;
					}

					const stderrChunks: Buffer[] = [];
					let stderrLength = 0;
					stream.stderr.on("data", (chunk: Buffer) => {
						stderrChunks.push(chunk);
						stderrLength += chunk.length;
						stderrLength = capStderr(stderrChunks, stderrLength);
					});

					const exitPromise = new Promise<number | null>(
						(resolveExit, rejectExit) => {
							stream.on("close", (code: number | null) => {
								conn.end();
								resolveExit(code);
							});
							stream.on("error", (streamErr: Error) => {
								conn.end();
								rejectExit(streamErr);
							});
						},
					);

					resolve({
						stdin: stream,
						stdout: stream,
						waitForExit: () => exitPromise,
						getStderr: () => Buffer.concat(stderrChunks).toString("utf8"),
						dispose: () => {
							stream.destroy();
							conn.end();
						},
					});
				});
			})
			.on("error", (err) => {
				conn.end();
				reject(err);
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
				readyTimeout: 30_000,
				keepaliveInterval: SSH_KEEPALIVE_INTERVAL_MS,
				keepaliveCountMax: SSH_KEEPALIVE_COUNT_MAX,
			});
	});
};

/**
 * Opens a channel that runs `command` either locally (child_process) or on a
 * remote server (ssh2 exec), depending on `serverId`. The returned channel
 * exposes raw stdin/stdout streams so binary data (e.g. a tar archive) can be
 * piped through without ever being buffered in full in memory.
 */
export const openCommandChannel = (
	serverId: string | null,
	command: string,
	options: { cwd?: string } = {},
): Promise<CommandChannel> => {
	if (!serverId) {
		return Promise.resolve(openLocalCommandChannel(command, options));
	}
	return openRemoteCommandChannel(serverId, command);
};

/**
 * Opens the source and destination channels of a transfer concurrently and,
 * if either fails to open, disposes whichever side DID succeed before
 * rethrowing - otherwise a destination-open failure (e.g. a dead SSH
 * connection) would silently leak the already-open source channel's child
 * process/SSH connection forever. The thrown error names which side(s)
 * failed and preserves their original messages.
 */
export const openCommandChannelPair = async ({
	sourceServerId,
	sourceCommand,
	targetServerId,
	targetCommand,
	sourceOptions = {},
	targetOptions = {},
}: {
	sourceServerId: string | null;
	sourceCommand: string;
	targetServerId: string | null;
	targetCommand: string;
	sourceOptions?: { cwd?: string };
	targetOptions?: { cwd?: string };
}): Promise<{ source: CommandChannel; destination: CommandChannel }> => {
	const [sourceResult, destinationResult] = await Promise.allSettled([
		openCommandChannel(sourceServerId, sourceCommand, sourceOptions),
		openCommandChannel(targetServerId, targetCommand, targetOptions),
	]);

	if (
		sourceResult.status === "fulfilled" &&
		destinationResult.status === "fulfilled"
	) {
		return { source: sourceResult.value, destination: destinationResult.value };
	}

	if (sourceResult.status === "fulfilled") {
		sourceResult.value.dispose();
	}
	if (destinationResult.status === "fulfilled") {
		destinationResult.value.dispose();
	}

	const failures: string[] = [];
	if (sourceResult.status === "rejected") {
		const reason = sourceResult.reason;
		failures.push(
			`source: ${reason instanceof Error ? reason.message : String(reason)}`,
		);
	}
	if (destinationResult.status === "rejected") {
		const reason = destinationResult.reason;
		failures.push(
			`destination: ${reason instanceof Error ? reason.message : String(reason)}`,
		);
	}
	throw new Error(`Failed to open transfer channel(s): ${failures.join("; ")}`);
};

/**
 * Streams the stdout of `source` directly into the stdin of `destination`
 * without buffering the full payload in memory, then waits for both
 * commands to exit and verifies both exit codes.
 *
 * Both channels' `waitForExit()` promises are ALWAYS settled - via
 * `Promise.allSettled`, unconditionally, even when `pipeline()` itself threw
 * - before disposal or any rethrow. `waitForExit()` returns an already-live
 * promise created back when the channel was opened (a `child.on("error", ...)`/
 * `stream.on("error", ...)` listener attached at that time), so if the
 * `pipeline()` step fails and this function returned early without ever
 * calling `waitForExit()` on both sides, a subsequent rejection on either
 * channel's exit promise (e.g. triggered by `dispose()` killing the process
 * mid-stream) would have no attached handler at all and surface as an
 * unhandled promise rejection that could crash the process. Awaiting both
 * via `allSettled` here guarantees a handler is always attached - regardless
 * of which failure path is taken - so no rejection can ever go unhandled;
 * both channels are still disposed exactly once afterward, in every case.
 */
export const pipeCommandChannels = async ({
	source,
	destination,
	label,
}: {
	source: CommandChannel;
	destination: CommandChannel;
	label: string;
}): Promise<void> => {
	let pipelineError: unknown = null;
	try {
		await pipeline(source.stdout, destination.stdin);
	} catch (error) {
		pipelineError = error;
		source.dispose();
		destination.dispose();
	}

	const [sourceResult, destinationResult] = await Promise.allSettled([
		source.waitForExit(),
		destination.waitForExit(),
	]);

	if (!pipelineError) {
		source.dispose();
		destination.dispose();
	}

	if (pipelineError) {
		throw pipelineError instanceof Error
			? new Error(
					`${label}: streaming transfer failed: ${pipelineError.message}`,
				)
			: pipelineError;
	}

	if (sourceResult.status === "rejected") {
		const reason = sourceResult.reason;
		throw new CommandChannelError(
			`${label}: failed waiting for the source command to exit: ${reason instanceof Error ? reason.message : String(reason)}`,
			label,
			null,
			source.getStderr(),
		);
	}
	if (destinationResult.status === "rejected") {
		const reason = destinationResult.reason;
		throw new CommandChannelError(
			`${label}: failed waiting for the destination command to exit: ${reason instanceof Error ? reason.message : String(reason)}`,
			label,
			null,
			destination.getStderr(),
		);
	}

	const sourceExit = sourceResult.value;
	const destinationExit = destinationResult.value;

	if (sourceExit !== 0) {
		throw new CommandChannelError(
			`${label}: source command failed (exit code ${sourceExit}): ${source.getStderr().trim()}`,
			label,
			sourceExit,
			source.getStderr(),
		);
	}

	if (destinationExit !== 0) {
		throw new CommandChannelError(
			`${label}: destination command failed (exit code ${destinationExit}): ${destination.getStderr().trim()}`,
			label,
			destinationExit,
			destination.getStderr(),
		);
	}
};

/**
 * Runs a single command (no piping) on local/remote and waits for it to
 * finish, checking the exit code. Useful for the "create target volume" /
 * "mkdir target directory" steps that don't need streaming.
 *
 * The channel is disposed in a `finally` so a `waitForExit()` rejection
 * (a stream/connection error, not just a non-zero exit) can't skip cleanup
 * and leak the underlying child process/SSH connection.
 */
export const runChannelCommand = async (
	serverId: string | null,
	command: string,
	options: { cwd?: string; label?: string } = {},
): Promise<void> => {
	const channel = await openCommandChannel(serverId, command, options);
	let exitCode: number | null;
	let stderr: string;
	try {
		channel.stdin.end();
		exitCode = await channel.waitForExit();
		stderr = channel.getStderr();
	} finally {
		channel.dispose();
	}
	if (exitCode !== 0) {
		throw new CommandChannelError(
			`${options.label ?? "command"} failed (exit code ${exitCode}): ${stderr.trim()}`,
			options.label ?? command,
			exitCode,
			stderr,
		);
	}
};

/**
 * Runs a single command (no piping) on local/remote and resolves to its
 * captured stdout, checking the exit code. Used for reads that need the
 * command's output rather than just its exit code (e.g. reading back the
 * migration-token label written by `buildCreateVolumeCommand`).
 *
 * The channel is disposed in a `finally` for the same reason as
 * `runChannelCommand`.
 */
export const captureChannelCommandOutput = async (
	serverId: string | null,
	command: string,
	options: { cwd?: string; label?: string } = {},
): Promise<string> => {
	const channel = await openCommandChannel(serverId, command, options);
	const stdoutChunks: Buffer[] = [];
	channel.stdout.on("data", (chunk: Buffer) => {
		stdoutChunks.push(chunk);
	});
	let exitCode: number | null;
	let stderr: string;
	try {
		channel.stdin.end();
		exitCode = await channel.waitForExit();
		stderr = channel.getStderr();
	} finally {
		channel.dispose();
	}
	if (exitCode !== 0) {
		throw new CommandChannelError(
			`${options.label ?? "command"} failed (exit code ${exitCode}): ${stderr.trim()}`,
			options.label ?? command,
			exitCode,
			stderr,
		);
	}
	return Buffer.concat(stdoutChunks).toString("utf8");
};

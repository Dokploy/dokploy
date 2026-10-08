import { exec, execFile, spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import util from "node:util";
import { findServerById } from "@dokploy/server/services/server";
import {
	type RemoteBuildCancelTarget,
	wrapCancelableRemoteBuild,
} from "@dokploy/server/utils/builders/remote-build-cancel";
import { Client } from "ssh2";
import { registerRemoteBuild } from "./remote-build-registry";
import {
	ExecError,
	MAX_EXEC_OUTPUT_TAIL,
	truncateOutputTail,
} from "./ExecError";

export class WriteFileRemoteError extends Error {
	constructor(
		message: string,
		public readonly context: {
			remotePath: string;
			serverId: string;
			originalError: Error;
		},
	) {
		super(message);
		this.name = "WriteFileRemoteError";
	}
}

// Re-export ExecError for easier imports
export {
	ExecError,
	MAX_EXEC_OUTPUT_TAIL,
	truncateOutputTail,
} from "./ExecError";

const execAsyncBase = util.promisify(exec);

export const execAsync = async (
	command: string,
	options?: {
		cwd?: string;
		env?: NodeJS.ProcessEnv;
		shell?: string;
		maxBuffer?: number;
	},
): Promise<{ stdout: string; stderr: string }> => {
	try {
		const result = await execAsyncBase(command, options);
		return {
			stdout: result.stdout.toString(),
			stderr: result.stderr.toString(),
		};
	} catch (error) {
		if (error instanceof Error) {
			// @ts-expect-error - exec error has these properties
			const exitCode = error.code;
			// @ts-expect-error
			const stdout = error.stdout?.toString() || "";
			// @ts-expect-error
			const stderr = error.stderr?.toString() || "";

			throw new ExecError(`Command execution failed: ${error.message}`, {
				command,
				stdout,
				stderr,
				exitCode,
				originalError: error,
			});
		}
		throw error;
	}
};

interface ExecOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	// Output buffered per stream before the child is killed (exec default 1 MiB).
	maxBuffer?: number;
	// The caller consumes the output through onData. Only the tail of each
	// stream is kept for the result and errors, and there is no size limit.
	streamOnly?: boolean;
}

/**
 * Keeps a command's output: all of it, or with `tailOnly` just enough of the
 * end for an error message, so streamed output never piles up in memory.
 */
class OutputCollector {
	private text = "";

	constructor(private readonly tailOnly = false) {}

	add(chunk: string): void {
		this.text += chunk;
		if (this.tailOnly && this.text.length > 4 * MAX_EXEC_OUTPUT_TAIL) {
			this.text = this.text.slice(-2 * MAX_EXEC_OUTPUT_TAIL);
		}
	}

	get value(): string {
		return this.tailOnly
			? this.text.slice(-2 * MAX_EXEC_OUTPUT_TAIL)
			: this.text;
	}
}

// exec buffers everything for its callback and kills the command past
// maxBuffer, so streamed commands run through spawn instead.
const spawnStream = (
	command: string,
	onData: ((data: string) => void) | undefined,
	{ cwd, env }: ExecOptions,
): Promise<{ stdout: string; stderr: string }> => {
	return new Promise((resolve, reject) => {
		const stdout = new OutputCollector(true);
		const stderr = new OutputCollector(true);
		const child = spawn(command, { cwd, env, shell: true });

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (data: string) => {
			stdout.add(data);
			onData?.(data);
		});
		child.stderr.on("data", (data: string) => {
			stderr.add(data);
			onData?.(data);
		});

		child.on("error", (error) => {
			reject(
				new ExecError(`Command execution error: ${error.message}`, {
					command,
					stdout: stdout.value,
					stderr: stderr.value,
					originalError: error,
				}),
			);
		});
		child.on("close", (code, signal) => {
			if (code === 0) {
				resolve({ stdout: stdout.value, stderr: stderr.value });
				return;
			}
			const outputTail = truncateOutputTail(stderr.value || stdout.value);
			reject(
				new ExecError(
					`Command failed with ${
						code === null ? `signal ${signal}` : `exit code ${code}`
					}${outputTail ? `: ${outputTail}` : ""}`,
					{
						command,
						stdout: stdout.value,
						stderr: stderr.value,
						exitCode: code ?? undefined,
					},
				),
			);
		});
	});
};

export const execAsyncStream = (
	command: string,
	onData?: (data: string) => void,
	options: ExecOptions = {},
): Promise<{ stdout: string; stderr: string }> => {
	if (options.streamOnly) return spawnStream(command, onData, options);
	return new Promise((resolve, reject) => {
		let stdoutComplete = "";
		let stderrComplete = "";

		const childProcess = exec(command, options, (error) => {
			if (error) {
				reject(
					new ExecError(`Command execution failed: ${error.message}`, {
						command,
						stdout: stdoutComplete,
						stderr: stderrComplete,
						exitCode: error.code,
						originalError: error,
					}),
				);
				return;
			}
			resolve({ stdout: stdoutComplete, stderr: stderrComplete });
		});

		childProcess.stdout?.on("data", (data: Buffer | string) => {
			const stringData = data.toString();
			stdoutComplete += stringData;
			if (onData) {
				onData(stringData);
			}
		});

		childProcess.stderr?.on("data", (data: Buffer | string) => {
			const stringData = data.toString();
			stderrComplete += stringData;
			if (onData) {
				onData(stringData);
			}
		});

		childProcess.on("error", (error) => {
			console.log(error);
			reject(
				new ExecError(`Command execution error: ${error.message}`, {
					command,
					stdout: stdoutComplete,
					stderr: stderrComplete,
					originalError: error,
				}),
			);
		});
	});
};

export const execFileAsync = async (
	command: string,
	args: string[],
	options: { input?: string } = {},
): Promise<{ stdout: string; stderr: string }> => {
	const child = execFile(command, args);

	if (options.input && child.stdin) {
		child.stdin.write(options.input);
		child.stdin.end();
	}

	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		child.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(
					new Error(`Command failed with code ${code}. Stderr: ${stderr}`),
				);
			}
		});

		child.on("error", reject);
	});
};

export const execAsyncRemote = async (
	serverId: string | null,
	command: string,
	onData?: (data: string) => void,
	// The caller consumes the output through onData; keep only its tail.
	options: {
		streamOnly?: boolean;
		/**
		 * A build on a build server that Dokploy must be able to cancel: the
		 * command runs in its own session with a pid file (see
		 * `builders/remote-build-cancel.ts`), and `abortRemoteBuild(deploymentId)`
		 * can drop this connection. Omitted for every other command, which then
		 * runs exactly as before.
		 */
		cancelable?: RemoteBuildCancelTarget;
	} = {},
): Promise<{ stdout: string; stderr: string }> => {
	if (!serverId) return { stdout: "", stderr: "" };
	const server = await findServerById(serverId);
	if (!server.sshKeyId) throw new Error("No SSH key available for this server");

	const stdoutOutput = new OutputCollector(options.streamOnly);
	const stderrOutput = new OutputCollector(options.streamOnly);
	// ssh2 hands over raw packets, which can split a UTF-8 character.
	const stdoutDecoder = new StringDecoder("utf8");
	const stderrDecoder = new StringDecoder("utf8");
	const emit = (output: OutputCollector, text: string) => {
		if (!text) return;
		output.add(text);
		onData?.(text);
	};
	const { cancelable } = options;
	const remoteCommand = cancelable
		? wrapCancelableRemoteBuild(command, cancelable)
		: command;
	return new Promise((resolve, reject) => {
		const conn = new Client();
		if (cancelable) {
			// Dropping the connection rejects this command so the deployment job
			// ends; the build on the server is stopped separately, by pid file.
			const unregister = registerRemoteBuild(cancelable.deploymentId, (reason) => {
				conn.destroy();
				reject(
					new ExecError(`Remote build was cancelled: ${reason}`, {
						command,
						serverId,
					}),
				);
			});
			conn.once("close", unregister);
		}

		sleep(1000);
		conn
			.once("ready", () => {
				conn.exec(remoteCommand, (err, stream) => {
					if (err) {
						onData?.(err.message);
						reject(
							new ExecError(`Remote command execution failed: ${err.message}`, {
								command,
								serverId,
								originalError: err,
							}),
						);
						return;
					}
					stream
						.on("close", (code: number, _signal: string) => {
							conn.end();
							emit(stdoutOutput, stdoutDecoder.end());
							emit(stderrOutput, stderrDecoder.end());
							const stdout = stdoutOutput.value;
							const stderr = stderrOutput.value;
							if (code === 0) {
								resolve({ stdout, stderr });
							} else {
								// Node's local exec embeds the command output in the error
								// message; ssh2 does not, so a remote failure used to reach
								// notifications/Sentry as a bare "exit code N". Append the
								// tail of whatever the command printed (ExecError redacts
								// secrets in the message).
								const outputTail = truncateOutputTail(stderr || stdout);
								reject(
									new ExecError(
										`Remote command failed with exit code ${code}${
											outputTail ? `: ${outputTail}` : ""
										}`,
										{
											command,
											stdout,
											stderr,
											exitCode: code,
											serverId,
										},
									),
								);
							}
						})
						.on("data", (data: Buffer) => {
							emit(stdoutOutput, stdoutDecoder.write(data));
						})
						.stderr.on("data", (data: Buffer) => {
							emit(stderrOutput, stderrDecoder.write(data));
						});
				});
			})
			.on("error", (err) => {
				conn.end();
				if (err.level === "client-authentication") {
					const technicalDetail = `Error: ${err.message} ${err.level}`;
					const friendlyMessage = [
						"",
						"❌ Couldn't connect to your server — the SSH key was not accepted.",
						"",
						"This usually means the key doesn't match what's on the server, or the key format is invalid.",
						"",
						`Technical details: ${technicalDetail}`,
						"",
						"💡 Hints:",
						"  • Check that the SSH key you added in Dokploy is the same one installed on the server (e.g. in ~/.ssh/authorized_keys).",
						"  • Try generating a new SSH key in Dokploy and add only the public key to the server, then try again.",
						"  • Make sure to follow the instructions on the Setup Server Button on the SSH Keys tab and then click on deployments tab and check the logs for more details.",
					].join("\n");
					const errorMsg = `Authentication failed: Invalid SSH private key. ❌ Error: ${err.message} ${err.level}`;
					onData?.(friendlyMessage);
					reject(
						new ExecError(
							`Authentication failed: Invalid SSH private key. ${friendlyMessage}`,
							{
								command,
								serverId,
								originalError: err,
							},
						),
					);
				} else {
					const errorMsg = `SSH connection error: ${err.message}`;
					onData?.(errorMsg);
					reject(
						new ExecError(errorMsg, {
							command,
							serverId,
							originalError: err,
						}),
					);
				}
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
				timeout: 99999,
			});
	});
};

/** A command on a remote server that reads its input from a caller. */
export interface RemoteInputSession {
	/**
	 * Hands data to the SSH channel for the command's stdin. Resolves once the
	 * channel can take more, which does not mean the command has read it;
	 * rejects if the command or the connection has already failed.
	 */
	write(data: Buffer): Promise<void>;
	/**
	 * Closes stdin and waits for the command. Only this confirms delivery:
	 * it rejects unless the command exits 0.
	 */
	end(): Promise<void>;
	/** Drops the connection; pending and later calls reject. */
	abort(): void;
}

/**
 * Starts `command` on a remote server over one SSH connection and keeps its
 * stdin open, so a caller can feed it data for as long as it needs.
 */
export const openRemoteInputSession = async (
	serverId: string,
	command: string,
	options: {
		/**
		 * Receives the command's stdout as it arrives (stderr is not passed on).
		 * For commands whose output the caller needs, not just their exit status.
		 */
		onStdout?: (text: string) => void;
	} = {},
): Promise<RemoteInputSession> => {
	const server = await findServerById(serverId);
	if (!server.sshKeyId) throw new Error("No SSH key available for this server");

	return new Promise((resolve, reject) => {
		const conn = new Client();
		const output = new OutputCollector(true);
		let opened = false;
		// undefined while the command runs, then null (exit 0) or the failure.
		let outcome: Error | null | undefined;
		let settle: (error: Error | null) => void = () => {};
		const finished = new Promise<Error | null>((resolveFinished) => {
			settle = resolveFinished;
		});
		const finish = (error: Error | null) => {
			if (outcome !== undefined) return;
			outcome = error;
			conn.end();
			settle(error);
		};
		const failure = (error: Error | null) =>
			error ??
			new ExecError("Remote command exited before reading all its input", {
				command,
				serverId,
			});

		conn
			.once("ready", () => {
				conn.exec(command, (err, stream) => {
					if (err) {
						conn.end();
						reject(
							new ExecError(`Remote command execution failed: ${err.message}`, {
								command,
								serverId,
								originalError: err,
							}),
						);
						return;
					}
					opened = true;
					stream.setEncoding("utf8");
					stream.stderr.setEncoding("utf8");
					stream.on("data", (data: string) => {
						output.add(data);
						options.onStdout?.(data);
					});
					stream.stderr.on("data", (data: string) => output.add(data));
					stream.on("close", (code: number | undefined) => {
						if (code === 0) {
							finish(null);
							return;
						}
						const outputTail = truncateOutputTail(output.value);
						finish(
							new ExecError(
								`${
									code == null
										? "Remote command ended without an exit status"
										: `Remote command failed with exit code ${code}`
								}${outputTail ? `: ${outputTail}` : ""}`,
								{ command, stderr: output.value, exitCode: code, serverId },
							),
						);
					});
					// The session is useless once the command is gone; drop
					// whatever is still queued.
					stream.on("error", (error: Error) =>
						finish(
							new ExecError(`Remote command stream error: ${error.message}`, {
								command,
								serverId,
								originalError: error,
							}),
						),
					);

					resolve({
						write: async (data) => {
							if (outcome !== undefined) throw failure(outcome);
							if (stream.write(data)) return;
							const drained = new Promise<null>((resolveDrained) =>
								stream.once("drain", () => resolveDrained(null)),
							);
							const error = await Promise.race([
								drained,
								finished.then(failure),
							]);
							if (error) throw error;
						},
						end: async () => {
							if (outcome === undefined) stream.end();
							const error = await finished;
							if (error) throw error;
						},
						abort: () => {
							// Destroy first: once finish() has ended the connection,
							// ssh2's destroy() no longer drops the socket.
							conn.destroy();
							finish(
								new ExecError("Remote command was aborted", {
									command,
									serverId,
								}),
							);
						},
					});
				});
			})
			.on("error", (err) => {
				const error = new ExecError(`SSH connection error: ${err.message}`, {
					command,
					serverId,
					originalError: err,
				});
				if (opened) {
					finish(error);
				} else {
					conn.end();
					reject(error);
				}
			})
			.on("close", () => {
				const error = new ExecError(
					"SSH connection closed before the command finished",
					{ command, serverId },
				);
				if (opened) {
					finish(error);
				} else {
					reject(error);
				}
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
				// A session can stay open for as long as a deploy hook runs; notice
				// a dead connection instead of waiting on it forever.
				keepaliveInterval: 10_000,
				keepaliveCountMax: 3,
			});
	});
};

export const writeFileRemote = async (
	serverId: string,
	remotePath: string,
	content: string,
): Promise<void> => {
	const server = await findServerById(serverId);
	if (!server.sshKeyId) throw new Error("No SSH key available for this server");

	return new Promise((resolve, reject) => {
		const conn = new Client();
		conn
			.once("ready", () => {
				conn.sftp((err, sftp) => {
					if (err) {
						conn.end();
						reject(
							new WriteFileRemoteError(`SFTP session failed: ${err.message}`, {
								remotePath,
								serverId,
								originalError: err,
							}),
						);
						return;
					}
					sftp.writeFile(remotePath, content, (writeErr) => {
						conn.end();
						if (writeErr) {
							reject(
								new WriteFileRemoteError(
									`Failed to write remote file ${remotePath}: ${writeErr.message}`,
									{ remotePath, serverId, originalError: writeErr },
								),
							);
							return;
						}
						resolve();
					});
				});
			})
			.on("error", (err) => {
				conn.end();
				reject(
					new WriteFileRemoteError(`SSH connection error: ${err.message}`, {
						remotePath,
						serverId,
						originalError: err,
					}),
				);
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
				timeout: 99999,
			});
	});
};

export const sleep = (ms: number) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

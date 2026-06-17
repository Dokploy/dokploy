import { exec, execFile, spawn } from "node:child_process";
import { findServerById } from "@dokploy/server/services/server";
import { Client } from "ssh2";
import { ExecError } from "./ExecError";
import {
	getCurrentJob,
	jobMarker,
	trackLocalChild,
	trackSshClient,
} from "./job-context";

// Re-export ExecError for easier imports
export { ExecError } from "./ExecError";

/**
 * When we're inside a deployment job, prepend a marker (`: DOKPLOY_JOB_ID=…`)
 * so the spawned shell's argv carries an identifier we can grep for, and
 * spawn the child detached (own process group) so cancel can `kill -PGID`
 * the entire build tree — shell, docker compose, docker build — in one shot.
 */
const tagCommand = (command: string): string => {
	const ctx = getCurrentJob();
	if (!ctx) return command;
	return `: ${jobMarker(ctx.jobId)};\n${command}`;
};

export const execAsync = (
	command: string,
	options?: { cwd?: string; env?: NodeJS.ProcessEnv; shell?: string },
): Promise<{ stdout: string; stderr: string }> => {
	const ctx = getCurrentJob();
	const tagged = tagCommand(command);

	// Outside a deployment job: plain exec — behaviour is unchanged for the
	// many non-deployment callers (git, docker inspect, etc.).
	if (!ctx) {
		return new Promise((resolve, reject) => {
			exec(tagged, options, (error, stdout, stderr) => {
				if (error) {
					const codeRaw = (error as { code?: unknown }).code;
					const exitCode = typeof codeRaw === "number" ? codeRaw : undefined;
					reject(
						new ExecError(`Command execution failed: ${error.message}`, {
							command,
							stdout: typeof stdout === "string" ? stdout : stdout.toString(),
							stderr: typeof stderr === "string" ? stderr : stderr.toString(),
							exitCode,
							originalError: error,
						}),
					);
					return;
				}
				resolve({
					stdout: typeof stdout === "string" ? stdout : stdout.toString(),
					stderr: typeof stderr === "string" ? stderr : stderr.toString(),
				});
			});
		});
	}

	// Inside a deployment job: spawn the shell DETACHED so it leads its own
	// process group (PGID = pid). Node's exec() silently ignores `detached`
	// (it's a spawn-only option), so the build tree (sh → nixpacks → docker
	// buildx) would otherwise stay in dokploy's own process group and the
	// cancel path's `kill(-PGID)` would have no group to hit. spawn() with
	// detached:true runs setsid, giving cancel a real group leader to signal.
	// Streaming stdout/stderr also avoids exec()'s 1 MB maxBuffer cap, which
	// a verbose build can blow right past.
	return new Promise((resolve, reject) => {
		const shell = options?.shell ?? "/bin/sh";
		const child = spawn(shell, ["-c", tagged], {
			cwd: options?.cwd,
			env: options?.env,
			detached: true,
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (data: Buffer | string) => {
			stdout += data.toString();
		});
		child.stderr?.on("data", (data: Buffer | string) => {
			stderr += data.toString();
		});
		child.on("error", (error) => {
			reject(
				new ExecError(`Command execution failed: ${error.message}`, {
					command,
					stdout,
					stderr,
					originalError: error,
				}),
			);
		});
		child.on("close", (code, signal) => {
			if (code === 0) {
				resolve({ stdout, stderr });
				return;
			}
			reject(
				new ExecError(
					signal
						? `Command execution terminated by signal ${signal}`
						: `Command execution failed with exit code ${code}`,
					{
						command,
						stdout,
						stderr,
						exitCode: typeof code === "number" ? code : undefined,
						originalError: new Error(
							signal ? `Killed by ${signal}` : `Exit code ${code}`,
						),
					},
				),
			);
		});
		trackLocalChild(ctx.jobId, child);
	});
};

interface ExecOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
}

export const execAsyncStream = (
	command: string,
	onData?: (data: string) => void,
	options: ExecOptions = {},
): Promise<{ stdout: string; stderr: string }> => {
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
						exitCode: (error as { code?: number }).code,
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
			console.error("execAsyncStream error", error);
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
): Promise<{ stdout: string; stderr: string }> => {
	if (!serverId) return { stdout: "", stderr: "" };
	const server = await findServerById(serverId);
	if (!server.sshKeyId) throw new Error("No SSH key available for this server");

	let stdout = "";
	let stderr = "";
	const tagged = tagCommand(command);
	const ctx = getCurrentJob();
	return new Promise((resolve, reject) => {
		const conn = new Client();
		if (ctx) trackSshClient(ctx.jobId, conn);

		conn
			.once("ready", () => {
				conn.exec(tagged, (err, stream) => {
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
							if (code === 0) {
								resolve({ stdout, stderr });
							} else {
								reject(
									new ExecError(
										`Remote command failed with exit code ${code}`,
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
						.on("error", (err: Error) => {
							reject(
								new ExecError(`Remote stream error: ${err.message}`, {
									command,
									stdout,
									stderr,
									serverId,
									originalError: err,
								}),
							);
						})
						.on("data", (data: string) => {
							stdout += data.toString();
							onData?.(data.toString());
						})
						.stderr.on("data", (data) => {
							stderr += data.toString();
							onData?.(data.toString());
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

export const sleep = (ms: number) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

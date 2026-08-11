import { exec, execFile } from "node:child_process";
import util from "node:util";
import { findServerById } from "@dokploy/server/services/server";
import { quote } from "shell-quote";
import { Client, type ConnectConfig, type SFTPWrapper } from "ssh2";
import { ExecError } from "./ExecError";
import {
	cleanupSecretTempFiles,
	type RemoteSecretFile,
	rewriteSecretTempFilesForRemote,
	takeSecretTempFilesForCommand,
} from "./secrets";

// Re-export ExecError for easier imports
export { ExecError } from "./ExecError";

const execAsyncBase = util.promisify(exec);

export const execAsync = async (
	command: string,
	options?: { cwd?: string; env?: NodeJS.ProcessEnv; shell?: string },
): Promise<{ stdout: string; stderr: string }> => {
	const secretFiles = takeSecretTempFilesForCommand(command);
	try {
		const result = await execAsyncBase(command, options);
		return {
			stdout: result.stdout.toString(),
			stderr: result.stderr.toString(),
		};
	} catch (error) {
		if (error instanceof Error) {
			// @ts-ignore - exec error has these properties
			const exitCode = error.code;
			// @ts-ignore
			const stdout = error.stdout?.toString() || "";
			// @ts-ignore
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
	} finally {
		cleanupSecretTempFiles(secretFiles);
	}
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
						// @ts-ignore
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
			onData?.(stringData);
		});

		childProcess.stderr?.on("data", (data: Buffer | string) => {
			const stringData = data.toString();
			stderrComplete += stringData;
			onData?.(stringData);
		});

		childProcess.on("error", (error) => {
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

const connectSsh = (conn: Client, config: ConnectConfig) =>
	new Promise<void>((resolve, reject) => {
		conn.once("ready", resolve).once("error", reject).connect(config);
	});

const runRemoteCommand = (
	conn: Client,
	command: string,
	serverId: string,
	onData?: (data: string) => void,
): Promise<{ stdout: string; stderr: string }> =>
	new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		conn.exec(command, (error, stream) => {
			if (error) {
				reject(
					new ExecError(`Remote command execution failed: ${error.message}`, {
						command,
						serverId,
						originalError: error,
					}),
				);
				return;
			}

			stream
				.on("close", (code: number) => {
					if (code === 0) {
						resolve({ stdout, stderr });
					} else {
						reject(
							new ExecError(`Remote command failed with exit code ${code}`, {
								command,
								stdout,
								stderr,
								exitCode: code,
								serverId,
							}),
						);
					}
				})
				.on("data", (data: Buffer | string) => {
					const value = data.toString();
					stdout += value;
					onData?.(value);
				});
			stream.stderr.on("data", (data: Buffer | string) => {
				const value = data.toString();
				stderr += value;
				onData?.(value);
			});
		});
	});

const openSftp = (conn: Client) =>
	new Promise<SFTPWrapper>((resolve, reject) => {
		conn.sftp((error, sftp) => (error ? reject(error) : resolve(sftp)));
	});

const uploadSecretFile = (
	sftp: SFTPWrapper,
	file: RemoteSecretFile,
): Promise<void> =>
	new Promise((resolve, reject) => {
		sftp.fastPut(
			file.localPath,
			file.remotePath,
			{ mode: file.mode },
			(error) => (error ? reject(error) : resolve()),
		);
	});

const stageRemoteSecretFiles = async (
	conn: Client,
	serverId: string,
	files: readonly RemoteSecretFile[],
) => {
	const sftp = await openSftp(conn);
	try {
		for (const file of files) {
			await runRemoteCommand(
				conn,
				`mkdir -m 700 ${quote([file.remoteDir])}`,
				serverId,
			);
			await uploadSecretFile(sftp, file);
		}
	} finally {
		sftp.end();
	}
};

export const execAsyncRemote = async (
	serverId: string | null,
	command: string,
	onData?: (data: string) => void,
): Promise<{ stdout: string; stderr: string }> => {
	const secretFiles = takeSecretTempFilesForCommand(command);
	if (!serverId) {
		cleanupSecretTempFiles(secretFiles);
		return { stdout: "", stderr: "" };
	}

	const conn = new Client();
	let remoteRoot: string | undefined;
	try {
		const server = await findServerById(serverId);
		if (!server.sshKeyId)
			throw new Error("No SSH key available for this server");

		await connectSsh(conn, {
			host: server.ipAddress,
			port: server.port,
			username: server.username,
			privateKey: server.sshKey?.privateKey,
			timeout: 99999,
		});

		let remoteCommand = command;
		if (secretFiles.length > 0) {
			const result = await runRemoteCommand(
				conn,
				"mktemp -d /tmp/dokploy-secrets-XXXXXX",
				serverId,
			);
			remoteRoot = result.stdout.trim();
			if (!remoteRoot)
				throw new Error("Failed to create remote secret directory");

			const rewritten = rewriteSecretTempFilesForRemote(
				command,
				secretFiles,
				remoteRoot,
			);
			remoteCommand = rewritten.command;
			await stageRemoteSecretFiles(conn, serverId, rewritten.files);
		}

		return await runRemoteCommand(conn, remoteCommand, serverId, onData);
	} catch (error) {
		if (error instanceof ExecError) throw error;
		const sshError = error as Error & { level?: string };
		if (sshError.level === "client-authentication") {
			const friendlyMessage = [
				"",
				"❌ Couldn't connect to your server, the SSH key was not accepted.",
				"",
				"Check that the configured SSH key matches the server and uses a supported format.",
			].join("\n");
			onData?.(friendlyMessage);
			throw new ExecError(
				`Authentication failed: Invalid SSH private key. ${friendlyMessage}`,
				{ command, serverId, originalError: sshError },
			);
		}

		const message = `SSH connection error: ${sshError.message}`;
		onData?.(message);
		throw new ExecError(message, {
			command,
			serverId,
			originalError: sshError,
		});
	} finally {
		if (remoteRoot) {
			await runRemoteCommand(
				conn,
				`rm -rf ${quote([remoteRoot])}`,
				serverId,
			).catch(() => undefined);
		}
		conn.end();
		cleanupSecretTempFiles(secretFiles);
	}
};

export const sleep = (ms: number) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

import { spawn } from "node:child_process";
import { findServerById } from "../../services/server";
import { Client } from "ssh2";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import type { ConflictDecision, MountTransferConfig } from "./types";

const execOnServer = async (
	serverId: string | null,
	command: string,
): Promise<{ stdout: string; stderr: string }> => {
	if (serverId) {
		return execAsyncRemote(serverId, command);
	}
	return execAsync(command);
};

/**
 * Get a direct SSH connection to a server.
 * Used for streaming binary data (tar pipes) that can't go through execAsyncRemote.
 */
const getSSHConnection = async (
	serverId: string,
): Promise<{ conn: Client }> => {
	const server = await findServerById(serverId);
	if (!server.sshKeyId) {
		throw new Error(`No SSH key configured for server ${server.name}`);
	}

	return new Promise((resolve, reject) => {
		const conn = new Client();
		conn
			.on("ready", () => {
				resolve({ conn });
			})
			.on("error", (err) => {
				reject(
					new Error(
						`SSH connection failed to ${server.name} (${server.ipAddress}): ${err.message}`,
					),
				);
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
			});
	});
};

/**
 * Pipe a tar stream from source SSH connection to target SSH connection.
 */
const pipeSSH = (
	sourceConn: Client,
	targetConn: Client,
	sourceCmd: string,
	targetCmd: string,
	onLog?: (message: string) => void,
): Promise<void> => {
	return new Promise((resolve, reject) => {
		sourceConn.exec(sourceCmd, (err, sourceStream) => {
			if (err) return reject(new Error(`Source exec failed: ${err.message}`));

			targetConn.exec(targetCmd, (err2, targetStream) => {
				if (err2)
					return reject(new Error(`Target exec failed: ${err2.message}`));

				let totalBytes = 0;

				sourceStream.on("data", (chunk: Buffer) => {
					totalBytes += chunk.length;
					targetStream.write(chunk);
				});

				sourceStream.on("end", () => {
					targetStream.end();
				});

				targetStream.on("close", () => {
					onLog?.(
						`Transferred ${(totalBytes / 1024 / 1024).toFixed(2)} MB`,
					);
					resolve();
				});

				sourceStream.on("error", (e: Error) =>
					reject(new Error(`Source stream error: ${e.message}`)),
				);
				targetStream.on("error", (e: Error) =>
					reject(new Error(`Target stream error: ${e.message}`)),
				);
			});
		});
	});
};

/**
 * Stream data from local tar command into a remote SSH command.
 */
const pipeLocalToRemote = (
	targetConn: Client,
	localCmd: string,
	localArgs: string[],
	remoteCmd: string,
	onLog?: (message: string) => void,
): Promise<void> => {

	return new Promise((resolve, reject) => {
		const localProcess = spawn(localCmd, localArgs, {
			stdio: ["ignore", "pipe", "pipe"],
		});

		targetConn.exec(remoteCmd, (err, targetStream) => {
			if (err) {
				localProcess.kill();
				return reject(new Error(`Remote exec failed: ${err.message}`));
			}

			let totalBytes = 0;

			localProcess.stdout.on("data", (chunk: Buffer) => {
				totalBytes += chunk.length;
				targetStream.write(chunk);
			});

			localProcess.stdout.on("end", () => {
				targetStream.end();
			});

			targetStream.on("close", () => {
				onLog?.(
					`Transferred ${(totalBytes / 1024 / 1024).toFixed(2)} MB`,
				);
				resolve();
			});

			localProcess.on("error", (e) => reject(e));
			targetStream.on("error", (e: Error) => reject(e));
		});
	});
};

/**
 * Stream data from a remote SSH command into a local tar command.
 */
const pipeRemoteToLocal = (
	sourceConn: Client,
	remoteCmd: string,
	localCmd: string,
	localArgs: string[],
	onLog?: (message: string) => void,
): Promise<void> => {

	return new Promise((resolve, reject) => {
		const localProcess = spawn(localCmd, localArgs, {
			stdio: ["pipe", "pipe", "pipe"],
		});

		sourceConn.exec(remoteCmd, (err, sourceStream) => {
			if (err) {
				localProcess.kill();
				return reject(new Error(`Remote exec failed: ${err.message}`));
			}

			let totalBytes = 0;

			sourceStream.on("data", (chunk: Buffer) => {
				totalBytes += chunk.length;
				localProcess.stdin.write(chunk);
			});

			sourceStream.on("end", () => {
				localProcess.stdin.end();
			});

			localProcess.on("close", (code: number) => {
				onLog?.(
					`Transferred ${(totalBytes / 1024 / 1024).toFixed(2)} MB`,
				);
				if (code === 0) resolve();
				else reject(new Error(`Local process exited with code ${code}`));
			});

			sourceStream.on("error", (e: Error) => reject(e));
			localProcess.on("error", (e) => reject(e));
		});
	});
};

export const syncDirectory = async (
	sourceServerId: string | null,
	targetServerId: string,
	sourcePath: string,
	targetPath: string,
	onLog?: (message: string) => void,
): Promise<void> => {
	onLog?.(`Syncing directory: ${sourcePath} → ${targetPath}`);

	// Ensure target directory exists
	await execOnServer(targetServerId, `mkdir -p "${targetPath}"`);

	if (sourceServerId && targetServerId) {
		// Remote → Remote: pipe tar directly between SSH connections
		onLog?.("Using direct SSH pipe for remote-to-remote transfer...");
		const [source, target] = await Promise.all([
			getSSHConnection(sourceServerId),
			getSSHConnection(targetServerId),
		]);
		try {
			await pipeSSH(
				source.conn,
				target.conn,
				`tar czf - -C "${sourcePath}" . 2>/dev/null`,
				`tar xzf - -C "${targetPath}"`,
				onLog,
			);
		} finally {
			source.conn.end();
			target.conn.end();
		}
	} else if (!sourceServerId && targetServerId) {
		// Local → Remote
		onLog?.("Transferring from local to remote...");
		const { conn } = await getSSHConnection(targetServerId);
		try {
			await pipeLocalToRemote(
				conn,
				"tar",
				["czf", "-", "-C", sourcePath, "."],
				`tar xzf - -C "${targetPath}"`,
				onLog,
			);
		} finally {
			conn.end();
		}
	} else if (sourceServerId && !targetServerId) {
		// Remote → Local
		onLog?.("Transferring from remote to local...");
		await execAsync(`mkdir -p "${targetPath}"`);
		const { conn } = await getSSHConnection(sourceServerId);
		try {
			await pipeRemoteToLocal(
				conn,
				`tar czf - -C "${sourcePath}" . 2>/dev/null`,
				"tar",
				["xzf", "-", "-C", targetPath],
				onLog,
			);
		} finally {
			conn.end();
		}
	}

	onLog?.(`Directory synced successfully: ${targetPath}`);
};

export const syncDockerVolume = async (
	sourceServerId: string | null,
	targetServerId: string,
	volumeName: string,
	onLog?: (message: string) => void,
): Promise<void> => {
	onLog?.(`Syncing Docker volume: ${volumeName}`);

	// Ensure volume exists on target
	await execOnServer(
		targetServerId,
		`docker volume inspect "${volumeName}" > /dev/null 2>&1 || docker volume create "${volumeName}"`,
	);

	const srcTarCmd = `docker run --rm -v "${volumeName}":/volume:ro alpine tar czf - -C /volume . 2>/dev/null`;
	const dstTarCmd = `docker run --rm -i -v "${volumeName}":/volume alpine tar xzf - -C /volume`;

	if (sourceServerId && targetServerId) {
		// Remote → Remote
		onLog?.("Using direct SSH pipe for volume transfer...");
		const [source, target] = await Promise.all([
			getSSHConnection(sourceServerId),
			getSSHConnection(targetServerId),
		]);
		try {
			await pipeSSH(source.conn, target.conn, srcTarCmd, dstTarCmd, onLog);
		} finally {
			source.conn.end();
			target.conn.end();
		}
	} else if (!sourceServerId && targetServerId) {
		// Local → Remote
		onLog?.("Transferring volume from local to remote...");
		const { conn } = await getSSHConnection(targetServerId);
		try {
			await pipeLocalToRemote(
				conn,
				"docker",
				[
					"run", "--rm",
					"-v", `${volumeName}:/volume:ro`,
					"alpine", "tar", "czf", "-", "-C", "/volume", ".",
				],
				dstTarCmd,
				onLog,
			);
		} finally {
			conn.end();
		}
	} else if (sourceServerId && !targetServerId) {
		// Remote → Local
		onLog?.("Transferring volume from remote to local...");
		const { conn } = await getSSHConnection(sourceServerId);
		try {
			await pipeRemoteToLocal(
				conn,
				srcTarCmd,
				"docker",
				[
					"run", "--rm", "-i",
					"-v", `${volumeName}:/volume`,
					"alpine", "tar", "xzf", "-", "-C", "/volume",
				],
				onLog,
			);
		} finally {
			conn.end();
		}
	}

	onLog?.(`Volume synced successfully: ${volumeName}`);
};

export const syncMount = async (
	sourceServerId: string | null,
	targetServerId: string,
	mount: MountTransferConfig,
	_decisions: Record<string, ConflictDecision>,
	onLog?: (message: string) => void,
): Promise<void> => {
	if (mount.type === "volume" && mount.volumeName) {
		await syncDockerVolume(
			sourceServerId,
			targetServerId,
			mount.volumeName,
			onLog,
		);
	} else if (mount.type === "bind" && mount.hostPath) {
		await syncDirectory(
			sourceServerId,
			targetServerId,
			mount.hostPath,
			mount.hostPath,
			onLog,
		);
	} else if (mount.type === "file" && mount.content) {
		onLog?.("File mount will be recreated from database content during deploy");
	}
};

export const syncTraefikConfig = async (
	sourceServerId: string | null,
	targetServerId: string,
	appName: string,
	onLog?: (message: string) => void,
): Promise<void> => {
	onLog?.(`Syncing Traefik config for: ${appName}`);

	const configPath = "/etc/dokploy/traefik/dynamic";
	const configFile = `${configPath}/${appName}.yml`;

	let configContent: string;
	try {
		const { stdout } = await execOnServer(
			sourceServerId,
			`cat "${configFile}" 2>/dev/null`,
		);
		configContent = stdout;
	} catch {
		onLog?.("No Traefik config found on source, skipping");
		return;
	}

	if (!configContent.trim()) {
		onLog?.("Empty Traefik config on source, skipping");
		return;
	}

	await execOnServer(targetServerId, `mkdir -p "${configPath}"`);

	const b64 = Buffer.from(configContent).toString("base64");
	await execOnServer(
		targetServerId,
		`echo "${b64}" | base64 -d > "${configFile}"`,
	);

	onLog?.("Traefik config synced successfully");
};

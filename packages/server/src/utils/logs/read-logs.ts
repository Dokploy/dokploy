import { paths } from "@dokploy/server/constants";
import { findServerById } from "@dokploy/server/services/server";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Client } from "ssh2";

/**
 * Read deployment logs from a file (local or remote)
 */
export const readDeploymentLogs = async (
	logPath: string,
	serverId: string | null,
	options: {
		tail?: number;
		follow?: boolean;
	} = {},
): Promise<string> => {
	const { tail, follow } = options;

	if (serverId) {
		// Remote server - use SSH
		const server = await findServerById(serverId);
		if (!server.sshKeyId) {
			throw new Error("No SSH key available for this server");
		}

		if (follow) {
			// For follow mode, we'll need to stream, but for now return error
			// This will be handled by the streaming endpoint
			throw new Error("Follow mode not supported via SSH in this endpoint");
		}

		const tailCommand = tail ? `tail -n ${tail} ${logPath}` : `cat ${logPath}`;

		const { stdout } = await execAsyncRemote(serverId, tailCommand);
		return stdout;
	} else {
		// Local server
		if (!existsSync(logPath)) {
			return "";
		}

		if (follow) {
			// For follow mode, we'll need to stream
			throw new Error("Follow mode not supported in this endpoint");
		}

		if (tail) {
			// Read last N lines
			const { stdout } = await execAsync(`tail -n ${tail} ${logPath}`);
			return stdout;
		} else {
			// Read entire file
			return readFileSync(logPath, "utf8");
		}
	}
};

/**
 * Stream deployment logs (for follow mode)
 */
export const streamDeploymentLogs = async (
	logPath: string,
	serverId: string | null,
	onData: (data: string) => void,
	onError: (error: Error) => void,
	onClose: () => void,
): Promise<() => void> => {
	let cleanup: () => void = () => {};

	if (serverId) {
		// Remote server - use SSH
		const server = await findServerById(serverId);
		if (!server.sshKeyId) {
			throw new Error("No SSH key available for this server");
		}

		const client = new Client();
		let stream: any = null;

		client
			.on("ready", () => {
				const command = `tail -n +1 -f ${logPath}`;
				client.exec(command, (err, execStream) => {
					if (err) {
						onError(err);
						client.end();
						return;
					}
					stream = execStream;
					execStream
						.on("data", (data: string) => {
							onData(data.toString());
						})
						.stderr.on("data", (data) => {
							onData(data.toString());
						})
						.on("close", () => {
							client.end();
							onClose();
						});
				});
			})
			.on("error", (err) => {
				onError(err);
				onClose();
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
			});

		cleanup = () => {
			if (stream) {
				stream.destroy();
			}
			client.end();
		};
	} else {
		// Local server
		if (!existsSync(logPath)) {
			onError(new Error(`Log file not found: ${logPath}`));
			onClose();
			return cleanup;
		}

		const { spawn } = await import("node:child_process");
		const tail = spawn("tail", ["-n", "+1", "-f", logPath]);

		tail.stdout.on("data", (data) => {
			onData(data.toString());
		});

		tail.stderr.on("data", (data) => {
			onError(new Error(`tail error: ${data.toString()}`));
		});

		tail.on("close", () => {
			onClose();
		});

		cleanup = () => {
			tail.kill();
		};
	}

	return cleanup;
};

/**
 * Read container logs
 */
export const readContainerLogs = async (
	containerId: string,
	serverId: string | null,
	options: {
		tail?: number;
		since?: string;
		runType?: "swarm" | "native";
		follow?: boolean;
	} = {},
): Promise<string> => {
	const { tail = 100, since, runType = "native", follow } = options;

	if (follow) {
		// For follow mode, we'll need to stream
		throw new Error("Follow mode not supported in this endpoint");
	}

	const baseCommand = `docker ${runType === "swarm" ? "service" : "container"} logs --timestamps ${
		runType === "swarm" ? "--raw" : ""
	} --tail ${tail} ${since && since !== "all" ? `--since ${since}` : ""} ${containerId}`;

	if (serverId) {
		// Remote server
		const server = await findServerById(serverId);
		if (!server.sshKeyId) {
			throw new Error("No SSH key available for this server");
		}

		const { stdout } = await execAsyncRemote(serverId, baseCommand);
		return stdout;
	} else {
		// Local server
		const { stdout } = await execAsync(baseCommand);
		return stdout;
	}
};

/**
 * Stream container logs (for follow mode)
 */
export const streamContainerLogs = async (
	containerId: string,
	serverId: string | null,
	options: {
		tail?: number;
		since?: string;
		runType?: "swarm" | "native";
	},
	onData: (data: string) => void,
	onError: (error: Error) => void,
	onClose: () => void,
): Promise<() => void> => {
	const { tail = 100, since, runType = "native" } = options;

	let cleanup: () => void = () => {};

	if (serverId) {
		// Remote server - use SSH
		const server = await findServerById(serverId);
		if (!server.sshKeyId) {
			throw new Error("No SSH key available for this server");
		}

		const client = new Client();
		let stream: any = null;

		const baseCommand = `docker ${runType === "swarm" ? "service" : "container"} logs --timestamps ${
			runType === "swarm" ? "--raw" : ""
		} --tail ${tail} ${
			since && since !== "all" ? `--since ${since}` : ""
		} --follow ${containerId}`;

		client
			.once("ready", () => {
				client.exec(baseCommand, (err, execStream) => {
					if (err) {
						onError(err);
						client.end();
						return;
					}
					stream = execStream;
					execStream
						.on("data", (data: string) => {
							onData(data.toString());
						})
						.stderr.on("data", (data) => {
							onData(data.toString());
						})
						.on("close", () => {
							client.end();
							onClose();
						});
				});
			})
			.on("error", (err) => {
				onError(err);
				onClose();
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
			});

		cleanup = () => {
			if (stream) {
				stream.destroy();
			}
			client.end();
		};
	} else {
		// Local server
		const { spawn } = await import("node-pty");
		const os = await import("node:os");

		const shell =
			os.platform() === "win32"
				? "powershell.exe"
				: os.platform() === "darwin"
					? "zsh"
					: "bash";

		const baseCommand = `docker ${runType === "swarm" ? "service" : "container"} logs --timestamps ${
			runType === "swarm" ? "--raw" : ""
		} --tail ${tail} ${
			since && since !== "all" ? `--since ${since}` : ""
		} --follow ${containerId}`;

		const ptyProcess = spawn(shell, ["-c", baseCommand], {
			name: "xterm-256color",
			cwd: process.env.HOME,
			env: process.env,
			encoding: "utf8",
			cols: 80,
			rows: 30,
		});

		ptyProcess.onData((data) => {
			onData(data);
		});

		ptyProcess.on("exit", () => {
			onClose();
		});

		cleanup = () => {
			ptyProcess.kill();
		};
	}

	return cleanup;
};

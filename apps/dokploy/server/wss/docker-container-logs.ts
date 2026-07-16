import { spawn } from "node:child_process";
import type http from "node:http";
import { findServerById, IS_CLOUD, validateRequest } from "@dokploy/server";
import { Client, type ClientChannel } from "ssh2";
import { WebSocketServer } from "ws";
import {
	buildDockerLogsArguments,
	createDockerLogsDataHandler,
	isValidContainerId,
	isValidSearch,
	isValidSince,
	isValidTail,
	terminateDockerLogsProcess,
} from "./utils";

export const setupDockerContainerLogsWebSocketServer = (
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
	const wssTerm = new WebSocketServer({
		noServer: true,
		path: "/docker-container-logs",
	});

	server.on("upgrade", (req, socket, head) => {
		const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);

		if (pathname === "/_next/webpack-hmr") {
			return;
		}
		if (pathname === "/docker-container-logs") {
			wssTerm.handleUpgrade(req, socket, head, function done(ws) {
				wssTerm.emit("connection", ws, req);
			});
		}
	});

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	wssTerm.on("connection", async (ws, req) => {
		const url = new URL(req.url || "", `http://${req.headers.host}`);
		const containerId = url.searchParams.get("containerId");
		const tail = url.searchParams.get("tail") ?? "100";
		const search = url.searchParams.get("search") ?? "";
		const since = url.searchParams.get("since") ?? "all";
		const serverId = url.searchParams.get("serverId");
		const runType = url.searchParams.get("runType");
		const timers: {
			forceKill?: NodeJS.Timeout;
			ping?: NodeJS.Timeout;
		} = {};
		let localProcess: ReturnType<typeof spawn> | undefined;
		let sshClient: Client | undefined;
		let sshStream: ClientChannel | undefined;
		let isClosed = false;

		const cleanup = () => {
			if (isClosed) return;
			isClosed = true;

			if (timers.ping) clearInterval(timers.ping);

			if (sshStream) {
				try {
					sshStream.signal("KILL");
				} catch {}
				sshStream.close();
			}
			sshClient?.end();

			if (localProcess) {
				timers.forceKill = terminateDockerLogsProcess(localProcess);
			}
		};

		ws.once("close", cleanup);
		const { user, session } = await validateRequest(req);
		if (isClosed) return;

		if (!containerId) {
			ws.close(4000, "containerId no provided");
			return;
		}

		// Security: Validate containerId to prevent command injection
		if (!isValidContainerId(containerId)) {
			ws.close(4000, "Invalid container ID format");
			return;
		}

		if (!isValidTail(tail)) {
			ws.close(4000, "Invalid tail parameter");
			return;
		}

		if (!isValidSince(since)) {
			ws.close(4000, "Invalid since parameter");
			return;
		}

		if (search !== "" && !isValidSearch(search)) {
			ws.close(4000, "Invalid search parameter");
			return;
		}

		if (!user || !session) {
			ws.close();
			return;
		}

		// Set up keep-alive ping mechanism to prevent timeout
		// Send ping every 45 seconds to keep connection alive
		timers.ping = setInterval(() => {
			if (ws.readyState === ws.OPEN) {
				ws.ping();
			}
		}, 45000); // 45 seconds
		timers.ping.unref();

		const send = (data: Buffer | string) => {
			if (ws.readyState === ws.OPEN) {
				ws.send(data.toString());
			}
		};
		const dockerLogsArguments = buildDockerLogsArguments({
			containerId,
			runType,
			since,
			tail,
		});
		try {
			if (serverId) {
				const server = await findServerById(serverId);
				if (isClosed) return;

				if (server.organizationId !== session.activeOrganizationId) {
					ws.close();
					return;
				}

				if (!server.sshKeyId) {
					ws.close(4000, "No SSH key available for this server");
					return;
				}
				sshClient = new Client();
				sshClient
					.once("ready", () => {
						if (isClosed) {
							sshClient?.end();
							return;
						}
						const command = `docker ${dockerLogsArguments.join(" ")}`;
						// Use pty: true to ensure the remote process receives SIGHUP when SSH connection closes
						// This is crucial for terminating docker logs processes when the connection is closed
						sshClient?.exec(command, { pty: true }, (err, stream) => {
							if (err) {
								console.error("Execution error:", err);
								ws.close();
								sshClient?.end();
								return;
							}
							sshStream = stream;
							if (isClosed) {
								try {
									stream.signal("KILL");
								} catch {}
								stream.close();
								sshClient?.end();
								return;
							}
							const stdout = createDockerLogsDataHandler(search, send);
							const stderr = createDockerLogsDataHandler(search, send);
							stream
								.on("close", () => {
									stdout.flush();
									stderr.flush();
									sshClient?.end();
									ws.close();
								})
								.on("data", stdout.write)
								.stderr.on("data", stderr.write);
						});
					})
					.on("error", (err) => {
						console.error("SSH connection error:", err);
						send(`SSH error: ${err.message}`);
						ws.close(); // Cierra el WebSocket si hay un error con SSH
						sshClient?.end();
					})
					.connect({
						host: server.ipAddress,
						port: server.port,
						username: server.username,
						privateKey: server.sshKey?.privateKey,
					});
			} else {
				if (IS_CLOUD) {
					send("This feature is not available in the cloud version.");
					ws.close();
					return;
				}
				const stdout = createDockerLogsDataHandler(search, send);
				const stderr = createDockerLogsDataHandler(search, send);
				const childProcess = spawn("docker", dockerLogsArguments, {
					cwd: process.env.HOME,
					env: process.env,
					stdio: ["ignore", "pipe", "pipe"],
				});
				localProcess = childProcess;

				childProcess.stdout.on("data", stdout.write);
				childProcess.stderr.on("data", stderr.write);
				childProcess.once("close", () => {
					stdout.flush();
					stderr.flush();
					if (timers.forceKill) clearTimeout(timers.forceKill);
					ws.close();
				});
				childProcess.once("error", (error) => {
					send(error.message);
					ws.close();
				});
			}
		} catch (error) {
			// @ts-ignore
			const errorMessage = error?.message as unknown as string;

			send(errorMessage);
			ws.close();
		}
	});
};

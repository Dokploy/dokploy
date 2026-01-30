import { spawn } from "node:child_process";
import type http from "node:http";
import { findServerById, IS_CLOUD, validateRequest } from "@dokploy/server";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";
import { readValidDirectory } from "./utils";

export const setupDeploymentLogsWebSocketServer = (
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
	const wssTerm = new WebSocketServer({
		noServer: true,
		path: "/listen-deployment",
	});

	server.on("upgrade", (req, socket, head) => {
		const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);

		if (pathname === "/_next/webpack-hmr") {
			return;
		}
		if (pathname === "/listen-deployment") {
			wssTerm.handleUpgrade(req, socket, head, function done(ws) {
				wssTerm.emit("connection", ws, req);
			});
		}
	});

	wssTerm.on("connection", async (ws, req) => {
		const url = new URL(req.url || "", `http://${req.headers.host}`);
		const logPath = url.searchParams.get("logPath");
		const serverId = url.searchParams.get("serverId");
		const { user, session } = await validateRequest(req);

		// Generate unique connection ID for tracking
		const connectionId = `deployment-logs-${Date.now()}-${Math.random().toString(36).substring(7)}`;

		if (!logPath) {
			console.log(`[${connectionId}] logPath no provided`);
			ws.close(4000, "logPath no provided");
			return;
		}

		if (!readValidDirectory(logPath)) {
			ws.close(4000, "Invalid log path");
			return;
		}

		if (!user || !session) {
			ws.close();
			return;
		}

		let tailProcess: ReturnType<typeof spawn> | null = null;
		let sshClient: Client | null = null;

		try {
			if (serverId) {
				const server = await findServerById(serverId);

				if (!server.sshKeyId) {
					ws.close();
					return;
				}

				sshClient = new Client();
				sshClient
					.on("ready", () => {
						const command = `
						tail -n +1 -f ${logPath};
					`;
						sshClient!.exec(command, (err, stream) => {
							if (err) {
								sshClient!.end();
								ws.close();
								return;
							}
							stream
								.on("close", () => {
									sshClient!.end();
									ws.close();
								})
								.on("data", (data: string) => {
									if (ws.readyState === ws.OPEN) {
										ws.send(data.toString());
									}
								})
								.stderr.on("data", (data) => {
									if (ws.readyState === ws.OPEN) {
										ws.send(data.toString());
									}
								});
						});
					})
					.on("error", (err) => {
						if (ws.readyState === ws.OPEN) {
							ws.send(`SSH error: ${err.message}`);
							ws.close();
						}
						if (sshClient) {
							sshClient.end();
						}
					})
					.connect({
						host: server.ipAddress,
						port: server.port,
						username: server.username,
						privateKey: server.sshKey?.privateKey,
					});

				ws.on("close", () => {
					if (sshClient) {
						sshClient.end();
					}
				});
			} else {
				if (IS_CLOUD) {
					ws.send("This feature is not available in the cloud version.");
					ws.close();
					return;
				}
				tailProcess = spawn("tail", ["-n", "+1", "-f", logPath]);

				const stdout = tailProcess.stdout;
				const stderr = tailProcess.stderr;

				if (stdout) {
					stdout.on("data", (data) => {
						if (ws.readyState === ws.OPEN) {
							ws.send(data.toString());
						}
					});
				}

				if (stderr) {
					stderr.on("data", (data) => {
						if (ws.readyState === ws.OPEN) {
							ws.send(new Error(`tail error: ${data.toString()}`).message);
						}
					});
				}

				tailProcess.on("close", () => {
					ws.close();
				});

				tailProcess.on("error", () => {
					if (ws.readyState === ws.OPEN) {
						ws.close();
					}
				});

				ws.on("close", () => {
					if (tailProcess && !tailProcess.killed) {
						tailProcess.kill("SIGTERM");
						// Force kill after a timeout if it doesn't terminate
						setTimeout(() => {
							if (tailProcess && !tailProcess.killed) {
								tailProcess.kill("SIGKILL");
							} else {
							}
						}, 1000);
					} else {
					}
				});
			}
		} catch (error) {
			// Clean up resources on error
			if (tailProcess && !tailProcess.killed) {
				tailProcess.kill("SIGTERM");
				setTimeout(() => {
					if (tailProcess && !tailProcess.killed) {
						tailProcess.kill("SIGKILL");
					}
				}, 1000);
			}
			if (sshClient) {
				sshClient.end();
			}
			if (ws.readyState === ws.OPEN) {
				// @ts-ignore
				const errorMessage = error?.message as unknown as string;
				ws.send(errorMessage || "An error occurred");
				ws.close();
			}
		}
	});
};

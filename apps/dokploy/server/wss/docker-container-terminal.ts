import type http from "node:http";
import { findServerById, validateRequest } from "@dokploy/server";
import {
	shEscape,
	validateContainerId,
	validateShellType,
} from "@dokploy/server/utils/security/shell-escape";
import { spawn } from "node-pty";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";
import { getShell } from "./utils";

export const setupDockerContainerTerminalWebSocketServer = (
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
	const wssTerm = new WebSocketServer({
		noServer: true,
		path: "/docker-container-terminal",
	});

	server.on("upgrade", (req, socket, head) => {
		const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);

		if (pathname === "/_next/webpack-hmr") {
			return;
		}
		if (pathname === "/docker-container-terminal") {
			wssTerm.handleUpgrade(req, socket, head, function done(ws) {
				wssTerm.emit("connection", ws, req);
			});
		}
	});

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	wssTerm.on("connection", async (ws, req) => {
		const url = new URL(req.url || "", `http://${req.headers.host}`);
		const containerId = url.searchParams.get("containerId");
		const activeWay = url.searchParams.get("activeWay") || "sh";
		const serverId = url.searchParams.get("serverId");
		const { user, session } = await validateRequest(req);

		if (!containerId) {
			ws.close(4000, "containerId no provided");
			return;
		}

		// Validate container ID and shell type
		if (!validateContainerId(containerId)) {
			ws.close(4001, "Invalid container ID format");
			return;
		}

		if (!validateShellType(activeWay)) {
			ws.close(4002, "Invalid shell type");
			return;
		}

		if (!user || !session) {
			ws.close();
			return;
		}
		try {
			if (serverId) {
				const server = await findServerById(serverId);
				if (!server.sshKeyId)
					throw new Error("No SSH key available for this server");

				const conn = new Client();
				let _stdout = "";
				let _stderr = "";

				// Escape containerId and activeWay for safe shell execution
				const escapedContainerId = shEscape(containerId);
				const escapedActiveWay = shEscape(activeWay);

				conn
					.once("ready", () => {
						conn.exec(
							`docker exec -it -w / ${escapedContainerId} ${escapedActiveWay}`,
							{ pty: true },
							(err, stream) => {
								if (err) {
									console.error("SSH exec error:", err);
									ws.close();
									conn.end();
									return;
								}

								stream
									.on("close", (code: number, _signal: string) => {
										ws.send(`\nContainer closed with code: ${code}\n`);
										conn.end();
									})
									.on("data", (data: string) => {
										_stdout += data.toString();
										ws.send(data.toString());
									})
									.stderr.on("data", (data) => {
										_stderr += data.toString();
										ws.send(data.toString());
										console.error("Error: ", data.toString());
									});

								ws.on("message", (message) => {
									try {
										let command: string | Buffer[] | Buffer | ArrayBuffer;
										if (Buffer.isBuffer(message)) {
											command = message.toString("utf8");
										} else {
											command = message;
										}
										stream.write(command.toString());
									} catch (error) {
										// @ts-ignore
										const errorMessage = error?.message as unknown as string;
										ws.send(errorMessage);
									}
								});

								ws.on("close", () => {
									stream.end();
									// Ensure SSH connection is closed when WebSocket closes
									conn.end();
								});
							},
						);
					})
					.on("error", (err) => {
						console.error("SSH connection error:", err);
						if (ws.readyState === ws.OPEN) {
							ws.send(`SSH error: ${err.message}`);
							ws.close();
						}
						conn.end();
					})
					.connect({
						host: server.ipAddress,
						port: server.port,
						username: server.username,
						privateKey: server.sshKey?.privateKey,
					});
			} else {
				const shell = getShell();
				// Use array arguments instead of shell string to prevent injection
				// docker exec -it -w / <containerId> <shell>
				const ptyProcess = spawn(
					shell,
					[
						"-c",
						`docker exec -it -w / ${shEscape(containerId)} ${shEscape(activeWay)}`,
					],
					{},
				);

				ptyProcess.onData((data) => {
					ws.send(data);
				});
				ws.on("close", () => {
					ptyProcess.kill();
				});
				ws.on("message", (message) => {
					try {
						let command: string | Buffer[] | Buffer | ArrayBuffer;
						if (Buffer.isBuffer(message)) {
							command = message.toString("utf8");
						} else {
							command = message;
						}
						ptyProcess.write(command.toString());
					} catch (error) {
						// @ts-ignore
						const errorMessage = error?.message as unknown as string;
						ws.send(errorMessage);
					}
				});
			}
		} catch (error) {
			// @ts-ignore
			const errorMessage = error?.message as unknown as string;

			ws.send(errorMessage);
		}
	});
};

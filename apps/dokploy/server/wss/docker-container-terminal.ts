import type http from "node:http";
import { findServerById, IS_CLOUD, validateRequest } from "@dokploy/server";
import { spawn } from "node-pty";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";
import { isValidContainerId, isValidShell } from "./utils";

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
		const activeWay = url.searchParams.get("activeWay");
		const serverId = url.searchParams.get("serverId");
		const { user, session } = await validateRequest(req);

		if (!containerId) {
			ws.close(4000, "containerId not provided");
			return;
		}

		// Security: Validate containerId to prevent command injection
		if (!isValidContainerId(containerId)) {
			ws.close(4000, "Invalid container ID format");
			return;
		}

		// Security: Validate shell to prevent command injection
		if (activeWay && !isValidShell(activeWay)) {
			ws.close(4000, "Invalid shell specified");
			return;
		}

		// Default to 'sh' if no shell specified
		const shell = activeWay || "sh";

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
				conn
					.once("ready", () => {
						// Use array-style arguments to prevent shell injection
						const dockerCommand = [
							"docker",
							"exec",
							"-it",
							"-w",
							"/",
							containerId,
							shell,
						].join(" ");
						conn.exec(dockerCommand, { pty: true }, (err, stream) => {
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
						});
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
				if (IS_CLOUD) {
					ws.send("This feature is not available in the cloud version.");
					ws.close();
					return;
				}
				const ptyProcess = spawn(
					"docker",
					["exec", "-it", "-w", "/", containerId, shell],
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

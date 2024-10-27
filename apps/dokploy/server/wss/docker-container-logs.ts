import type http from "node:http";
import { findServerById, validateWebSocketRequest } from "@dokploy/server";
import { spawn } from "node-pty";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";
import { getShell } from "./utils";

function heartbeat() {
	// @ts-ignore
	this.isAlive = true;
}

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
		const tail = url.searchParams.get("tail");
		const serverId = url.searchParams.get("serverId");
		const { user, session } = await validateWebSocketRequest(req);

		if (!containerId) {
			ws.close(4000, "containerId no provided");
			return;
		}

		if (!user || !session) {
			ws.close();
			return;
		}

		// @ts-ignore
		ws.isAlive = true;
		ws.on("error", console.error);
		ws.on("pong", heartbeat);
		try {
			if (serverId) {
				const server = await findServerById(serverId);

				if (!server.sshKeyId) return;
				const client = new Client();
				client
					.once("ready", () => {
						const command = `
						bash -c "docker container logs --tail ${tail} --follow ${containerId}"
					`;
						client.exec(command, (err, stream) => {
							if (err) {
								console.error("Execution error:", err);
								ws.close();
								client.end();
								return;
							}
							stream
								.on("close", () => {
									console.log("Connection closed ✅ Container Logs");
									client.end();
									ws.close();
								})
								.on("data", (data: string) => {
									ws.send(data.toString());
								})
								.stderr.on("data", (data) => {
									ws.send(data.toString());
								});
						});
					})
					.on("error", (err) => {
						console.error("SSH connection error:", err);
						ws.send(`SSH error: ${err.message}`);
						ws.close(); // Cierra el WebSocket si hay un error con SSH
						client.end();
					})
					.connect({
						host: server.ipAddress,
						port: server.port,
						username: server.username,
						privateKey: server.sshKey?.privateKey,
					});
				ws.on("close", () => {
					console.log("Connection closed ✅, From Container Logs WS");
					client.end();
				});
			} else {
				const shell = getShell();
				const ptyProcess = spawn(
					shell,
					[
						"-c",
						`docker container logs --tail ${tail} --follow ${containerId}`,
					],
					{
						name: "xterm-256color",
						cwd: process.env.HOME,
						env: process.env,
						encoding: "utf8",
						cols: 80,
						rows: 30,
					},
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

	const interval = setInterval(function ping() {
		for (const ws of wssTerm.clients) {
			// @ts-ignore
			if (ws.isAlive === false) return ws.terminate();
			// @ts-ignore
			ws.isAlive = false;
			ws.ping();
		}
	}, 30000);

	wssTerm.on("close", function close() {
		clearInterval(interval);
	});
};

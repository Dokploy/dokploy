import { spawn } from "node:child_process";
import type http from "node:http";
import { findServerById, validateRequest } from "@dokploy/server";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";

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

		if (!logPath) {
			console.log("logPath no provided");
			ws.close(4000, "logPath no provided");
			return;
		}

		if (!user || !session) {
			ws.close();
			return;
		}

		try {
			if (serverId) {
				const server = await findServerById(serverId);

				if (!server.sshKeyId) return;
				const client = new Client();
				client
					.on("ready", () => {
						const command = `
						tail -n +1 -f ${logPath};
					`;
						client.exec(command, (err, stream) => {
							if (err) {
								console.error("Execution error:", err);
								ws.close();
								return;
							}
							stream
								.on("close", () => {
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
					})
					.connect({
						host: server.ipAddress,
						port: server.port,
						username: server.username,
						privateKey: server.sshKey?.privateKey,
					});

				ws.on("close", () => {
					client.end();
				});
			} else {
				const tail = spawn("tail", ["-n", "+1", "-f", logPath]);

				tail.stdout.on("data", (data) => {
					ws.send(data.toString());
				});

				tail.stderr.on("data", (data) => {
					ws.send(new Error(`tail error: ${data.toString()}`).message);
				});
				tail.on("close", () => {
					ws.close();
				});
			}
		} catch {
			// @ts-ignore
			// const errorMessage = error?.message as unknown as string;
			// ws.send(errorMessage);
		}
	});
};

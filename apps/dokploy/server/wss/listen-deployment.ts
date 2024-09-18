import { spawn } from "node:child_process";
import type http from "node:http";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";
import { findServerById } from "../api/services/server";
import { validateWebSocketRequest } from "../auth/auth";
import { readSSHKey } from "../utils/filesystem/ssh";

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
		const { user, session } = await validateWebSocketRequest(req);

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
				const keys = await readSSHKey(server.sshKeyId);
				const client = new Client();
				new Promise<void>((resolve, reject) => {
					client
						.on("ready", () => {
							const command = `
						tail -n +1 -f ${logPath};
					`;
							client.exec(command, (err, stream) => {
								if (err) {
									console.error("Execution error:", err);
									reject(err);
									return;
								}
								stream
									.on("close", () => {
										console.log("Connection closed ✅");
										client.end();
										resolve();
									})
									.on("data", (data: string) => {
										ws.send(data.toString());
										// console.log(`OUTPUT: ${data.toString()}`);
									})
									.stderr.on("data", (data) => {
										ws.send(data.toString());
										// console.error(`STDERR: ${data.toString()}`);
									});
							});
						})
						.connect({
							host: server.ipAddress,
							port: server.port,
							username: server.username,
							privateKey: keys.privateKey,
							timeout: 99999,
						});
				});
			} else {
				const tail = spawn("tail", ["-n", "+1", "-f", logPath]);

				tail.stdout.on("data", (data) => {
					ws.send(data.toString());
				});

				tail.stderr.on("data", (data) => {
					ws.send(new Error(`tail error: ${data.toString()}`).message);
				});
			}
		} catch (error) {
			// @ts-ignore
			//   const errorMessage = error?.message as unknown as string;
			ws.send(errorMessage);
		}
	});
};

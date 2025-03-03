import type http from "node:http";
import { findServerById, validateRequest } from "@dokploy/server";
import { spawn } from "node-pty";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";
import { getShell } from "./utils";

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
		const search = url.searchParams.get("search");
		const since = url.searchParams.get("since");
		const serverId = url.searchParams.get("serverId");
		const runType = url.searchParams.get("runType");
		const { user, session } = await validateRequest(req);

		if (!containerId) {
			ws.close(4000, "containerId no provided");
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
					.once("ready", () => {
						const baseCommand = `docker ${runType === "swarm" ? "service" : "container"} logs --timestamps ${
							runType === "swarm" ? "--raw" : ""
						} --tail ${tail} ${
							since === "all" ? "" : `--since ${since}`
						} --follow ${containerId}`;
						const escapedSearch = search ? search.replace(/'/g, "'\\''") : "";
						const command = search
							? `${baseCommand} 2>&1 | grep --line-buffered -iF "${escapedSearch}"`
							: baseCommand;
						client.exec(command, (err, stream) => {
							if (err) {
								console.error("Execution error:", err);
								ws.close();
								client.end();
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
						client.end();
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
				const shell = getShell();
				const baseCommand = `docker ${runType === "swarm" ? "service" : "container"} logs --timestamps ${
					runType === "swarm" ? "--raw" : ""
				} --tail ${tail} ${
					since === "all" ? "" : `--since ${since}`
				} --follow ${containerId}`;
				const command = search
					? `${baseCommand} 2>&1 | grep -iF '${search}'`
					: baseCommand;
				const ptyProcess = spawn(shell, ["-c", command], {
					name: "xterm-256color",
					cwd: process.env.HOME,
					env: process.env,
					encoding: "utf8",
					cols: 80,
					rows: 30,
				});

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

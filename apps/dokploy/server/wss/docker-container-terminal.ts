import type http from "node:http";
import { findServerById, IS_CLOUD, validateRequest } from "@dokploy/server";
import { spawn } from "node-pty";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";
import { canAccessDockerOverWss } from "./authorize";
import {
	attachTerminalInput,
	bindPtyLifecycle,
	bindSshConnectionLifecycle,
	SSH_READY_TIMEOUT_MS,
	sshTerminalTarget,
} from "./terminal-transport";
import {
	getErrorMessage,
	getTerminalSize,
	isValidContainerId,
	isValidShell,
} from "./utils";

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
		const serviceId = url.searchParams.get("serviceId");
		const { cols, rows } = getTerminalSize(url.searchParams);
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

		if (!(await canAccessDockerOverWss(user, session, serverId, serviceId))) {
			ws.close(4003, "Not authorized");
			return;
		}
		try {
			if (serverId) {
				const server = await findServerById(serverId);

				if (server.organizationId !== session.activeOrganizationId) {
					ws.close();
					return;
				}

				if (!server.sshKeyId)
					throw new Error("No SSH key available for this server");

				const conn = new Client();
				const lifecycle = bindSshConnectionLifecycle(ws, conn);
				if (!lifecycle.isActive()) return;

				conn
					.once("ready", () => {
						if (!lifecycle.isActive()) return;

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
						conn.exec(
							dockerCommand,
							{ pty: { term: "xterm-256color", cols, rows } },
							(err, stream) => {
								if (err) {
									console.error("SSH exec error:", err);
									if (lifecycle.isActive()) {
										ws.close();
									}
									lifecycle.close();
									return;
								}
								if (!lifecycle.setStream(stream)) return;

								stream
									.on("close", (code: number, _signal: string) => {
										if (ws.readyState === ws.OPEN) {
											ws.send(`\nContainer closed with code: ${code}\n`);
										}
										conn.end();
										if (ws.readyState === ws.OPEN) {
											ws.close();
										}
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
										console.error("Error: ", data.toString());
									});

								attachTerminalInput(ws, sshTerminalTarget(stream));
							},
						);
					})
					.on("error", (err) => {
						console.error("SSH connection error:", err);
						if (lifecycle.isActive()) {
							ws.send(`SSH error: ${err.message}`);
							ws.close();
						}
						lifecycle.close();
					})
					.connect({
						host: server.ipAddress,
						port: server.port,
						username: server.username,
						privateKey: server.sshKey?.privateKey,
						readyTimeout: SSH_READY_TIMEOUT_MS,
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
					{
						name: "xterm-256color",
						cols,
						rows,
					},
				);

				ptyProcess.onData((data) => {
					ws.send(data);
				});
				attachTerminalInput(ws, bindPtyLifecycle(ws, ptyProcess));
			}
		} catch (error) {
			ws.send(getErrorMessage(error));
		}
	});
};

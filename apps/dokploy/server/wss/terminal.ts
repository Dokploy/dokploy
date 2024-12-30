import type http from "node:http";
import {
	findServerById,
	IS_CLOUD,
	validateWebSocketRequest,
} from "@dokploy/server";
import { publicIpv4, publicIpv6 } from "public-ip";
import { Client, type ConnectConfig } from "ssh2";
import { WebSocketServer } from "ws";
import { setupLocalServerSSHKey } from "./utils";

export const getPublicIpWithFallback = async () => {
	// @ts-ignore
	let ip = null;
	try {
		ip = await publicIpv4();
	} catch (error) {
		console.log(
			"Error to obtain public IPv4 address, falling back to IPv6",
			// @ts-ignore
			error.message,
		);
		try {
			ip = await publicIpv6();
		} catch (error) {
			// @ts-ignore
			console.error("Error to obtain public IPv6 address", error.message);
			ip = null;
		}
	}
	return ip;
};

export const setupTerminalWebSocketServer = (
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
	const wssTerm = new WebSocketServer({
		noServer: true,
		path: "/terminal",
	});

	server.on("upgrade", (req, socket, head) => {
		const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);
		if (pathname === "/_next/webpack-hmr") {
			return;
		}
		if (pathname === "/terminal") {
			wssTerm.handleUpgrade(req, socket, head, function done(ws) {
				wssTerm.emit("connection", ws, req);
			});
		}
	});

	wssTerm.on("connection", async (ws, req) => {
		const url = new URL(req.url || "", `http://${req.headers.host}`);
		const serverId = url.searchParams.get("serverId");
		const { user, session } = await validateWebSocketRequest(req);
		if (!user || !session || !serverId) {
			ws.close();
			return;
		}

		let connectionDetails: ConnectConfig = {};

		const isLocalServer = serverId === "local";

		if (isLocalServer && !IS_CLOUD) {
			const port = Number(url.searchParams.get("port"));
			const username = url.searchParams.get("username");

			if (!port || !username) {
				ws.close();
				return;
			}

			ws.send("Setting up private SSH key...\n");
			const privateKey = await setupLocalServerSSHKey();

			if (!privateKey) {
				ws.close();
				return;
			}

			connectionDetails = {
				host: "localhost",
				port,
				username,
				privateKey,
			};
		} else {
			const server = await findServerById(serverId);

			if (!server) {
				ws.close();
				return;
			}

			const { ipAddress: host, port, username, sshKey, sshKeyId } = server;

			if (!sshKeyId) {
				throw new Error("No SSH key available for this server");
			}

			connectionDetails = {
				host,
				port,
				username,
				privateKey: sshKey?.privateKey,
			};
		}

		const conn = new Client();
		let stdout = "";
		let stderr = "";

		ws.send("Connecting...\n");

		conn
			.once("ready", () => {
				// Clear terminal content once connected
				ws.send("\x1bc");

				conn.shell({}, (err, stream) => {
					if (err) throw err;

					stream
						.on("close", (code: number, signal: string) => {
							ws.send(`\nContainer closed with code: ${code}\n`);
							conn.end();
						})
						.on("data", (data: string) => {
							stdout += data.toString();
							ws.send(data.toString());
						})
						.stderr.on("data", (data) => {
							stderr += data.toString();
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
					});
				});
			})
			.on("error", (err) => {
				if (err.level === "client-authentication") {
					ws.send(
						`Authentication failed: Unauthorized ${isLocalServer ? "" : "private SSH key or "}username.\n❌  Error: ${err.message} ${err.level}`,
					);
				} else {
					ws.send(`SSH connection error: ${err.message} ❌ `);
				}
				conn.end();
			})
			.connect(connectionDetails);
	});
};

import type http from "node:http";
import { publicIpv4, publicIpv6 } from "public-ip";
import { WebSocketServer } from "ws";
import { findServerById, validateWebSocketRequest } from "@dokploy/builders";
import { Client } from "ssh2";

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

		const server = await findServerById(serverId);

		if (!server) {
			ws.close();
			return;
		}

		if (!server.sshKeyId)
			throw new Error("No SSH key available for this server");

		const conn = new Client();
		let stdout = "";
		let stderr = "";
		conn
			.once("ready", () => {
				conn.shell(
					{
						term: "terminal",
						cols: 80,
						rows: 30,
						height: 30,
						width: 80,
					},
					(err, stream) => {
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
							console.log("Connection closed ✅");
							stream.end();
						});
					},
				);
			})
			.on("error", (err) => {
				if (err.level === "client-authentication") {
					ws.send(
						`Authentication failed: Invalid SSH private key. ❌ Error: ${err.message} ${err.level}`,
					);
				} else {
					ws.send(`SSH connection error: ${err.message}`);
				}
				conn.end();
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
				timeout: 99999,
			});
	});
};

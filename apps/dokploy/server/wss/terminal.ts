import type http from "node:http";
import { findServerById, IS_CLOUD, validateRequest } from "@dokploy/server";
import { publicIpv4, publicIpv6 } from "public-ip";
import { Client, type ConnectConfig } from "ssh2";
import { WebSocketServer } from "ws";
import { getDockerHost } from "../utils/docker";
import { setupLocalServerSSHKey } from "./utils";

const COMMAND_TO_ALLOW_LOCAL_ACCESS = `
# ----------------------------------------
mkdir -p $HOME/.ssh && \\
chmod 700 $HOME/.ssh && \\
touch $HOME/.ssh/authorized_keys && \\
chmod 600 $HOME/.ssh/authorized_keys && \\
cat /etc/dokploy/ssh/auto_generated-dokploy-local.pub >> $HOME/.ssh/authorized_keys && \\
echo "✓ Dokploy SSH key added successfully. Reopen the terminal in Dokploy to reconnect."
# ----------------------------------------`;

const COMMAND_TO_GRANT_PERMISSION_ACCESS = `
# ----------------------------------------
sudo chown -R $USER:$USER /etc/dokploy/ssh
# ----------------------------------------
`;

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
		const { user, session } = await validateRequest(req);
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

			try {
				ws.send("Setting up private SSH key...\n");
				const privateKey = await setupLocalServerSSHKey();

				if (!privateKey) {
					ws.close();
					return;
				}

				const dockerHost = await getDockerHost();

				ws.send(`Found Docker host: ${dockerHost}\n`);

				connectionDetails = {
					host: dockerHost,
					port,
					username,
					privateKey,
				};
			} catch (error) {
				console.error(`Error setting up private SSH key: ${error}`);
				ws.send(`Error setting up private SSH key: ${error}\n`);

				if (
					error instanceof Error &&
					error.message.includes("Permission denied")
				) {
					ws.send(
						`Please run the following command on your server to grant permission access and then reopen this window to reconnect:${COMMAND_TO_GRANT_PERMISSION_ACCESS}`,
					);
				}

				ws.close();
				return;
			}
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
		let _stdout = "";
		let _stderr = "";

		ws.send("Connecting...\n");

		conn
			.once("ready", () => {
				// Clear terminal content once connected
				ws.send("\x1bc");

				conn.shell({}, (err, stream) => {
					if (err) throw err;

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
					});
				});
			})
			.on("error", (err) => {
				if (err.level === "client-authentication") {
					if (isLocalServer) {
						ws.send(
							`Authentication failed: Please run the command below on your server to allow access. Make sure to run it as the same user as the one configured in connection settings:${COMMAND_TO_ALLOW_LOCAL_ACCESS}\nAfter running the command, reopen this window to reconnect. This procedure is required only once.`,
						);
					} else {
						ws.send(
							`Authentication failed: Unauthorized private SSH key or username.\n❌  Error: ${err.message} ${err.level}`,
						);
					}
				} else {
					ws.send(`SSH connection error: ${err.message} ❌ `);
				}
				conn.end();
			})
			.connect(connectionDetails);
	});
};

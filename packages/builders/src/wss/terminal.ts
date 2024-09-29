import type http from "node:http";
import path from "node:path";
import { spawn } from "node-pty";
import { publicIpv4, publicIpv6 } from "public-ip";
import { WebSocketServer } from "ws";
import { findServerById } from "@/server/services/server";
import { validateWebSocketRequest } from "../auth/auth";
import { paths } from "../constants";

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
		const { SSH_PATH } = paths();
		const privateKey = path.join(SSH_PATH, `${server.sshKeyId}_rsa`);
		const sshCommand = [
			"ssh",
			"-o",
			"StrictHostKeyChecking=no",
			"-i",
			privateKey,
			`${server.username}@${server.ipAddress}`,
		];
		const ptyProcess = spawn("ssh", sshCommand.slice(1), {
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
				console.log(error);
			}
		});

		ws.on("close", () => {
			ptyProcess.kill();
		});
	});
};

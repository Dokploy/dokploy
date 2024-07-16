import { writeFileSync } from "node:fs";
import type http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node-pty";
import { publicIpv4, publicIpv6 } from "public-ip";
import { WebSocketServer } from "ws";
import { findAdmin } from "../api/services/admin";
import { validateWebSocketRequest } from "../auth/auth";

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

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	wssTerm.on("connection", async (ws, req) => {
		const url = new URL(req.url || "", `http://${req.headers.host}`);
		const userSSH = url.searchParams.get("userSSH");
		const { user, session } = await validateWebSocketRequest(req);
		if (!user || !session) {
			ws.close();
			return;
		}
		if (user) {
			const admin = await findAdmin();
			const privateKey = admin.sshPrivateKey || "";
			const tempDir = tmpdir();
			const tempKeyPath = join(tempDir, "temp_ssh_key");
			writeFileSync(tempKeyPath, privateKey, { encoding: "utf8", mode: 0o600 });

			const sshUser = userSSH;
			const ip =
				process.env.NODE_ENV === "production"
					? await getPublicIpWithFallback()
					: "localhost";

			const sshCommand = [
				"ssh",
				...((process.env.NODE_ENV === "production" && ["-i", tempKeyPath]) ||
					[]),
				`${sshUser}@${ip}`,
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
		}
	});
};

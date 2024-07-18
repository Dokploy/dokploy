import { spawn } from "node:child_process";
import type http from "node:http";
import { WebSocketServer } from "ws";
import { validateWebSocketRequest } from "../auth/auth";

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
			const tail = spawn("tail", ["-n", "+1", "-f", logPath]);

			tail.stdout.on("data", (data) => {
				ws.send(data.toString());
			});

			tail.stderr.on("data", (data) => {
				ws.send(new Error(`tail error: ${data.toString()}`).message);
			});
		} catch (error) {
			// @ts-ignore
			//   const errorMessage = error?.message as unknown as string;
			//   ws.send(errorMessage);
		}
	});
};

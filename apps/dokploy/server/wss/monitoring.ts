import { spawn } from "node:child_process";
import type http from "node:http";
import { findServerById, validateWebSocketRequest } from "@dokploy/server";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";

export const setupMonitoringWebSocketServer = (
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
	const wssTerm = new WebSocketServer({
		noServer: true,
		path: "/listen-monitoring",
	});

	server.on("upgrade", (req, socket, head) => {
		const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);

		if (pathname === "/_next/webpack-hmr") {
			return;
		}
		if (pathname === "/listen-monitoring") {
			wssTerm.handleUpgrade(req, socket, head, function done(ws) {
				wssTerm.emit("connection", ws, req);
			});
		}
	});

	wssTerm.on("connection", async (ws, req) => {
		console.log("Nuevo agente conectado desde:", req.socket.remoteAddress);
		const url = new URL(req.url || "", `http://${req.headers.host}`);
		// const logPath = url.searchParams.get("logPath");
		// const serverId = url.searchParams.get("serverId");
		// const { user, session } = await validateWebSocketRequest(req);

		// if (!logPath) {
		// 	console.log("logPath no provided");
		// 	ws.close(4000, "logPath no provided");
		// 	return;
		// }

		ws.on("message", (data) => {
			try {
				const message = JSON.parse(data.toString());
				// console.log(message);
				// const message = {
				// 	type: "server",
				// 	data: {
				// 		cpu: 0,
				// 		mem: 0,
				// 	},
				// };
				// console.log(message);
				const timestamp = new Date().toISOString();

				if (message.type === "server") {
					console.log(`[${timestamp}] [Servidor Remoto] -`, message.data);
				}

				if (message.type === "container") {
					console.log(`[${timestamp}] [Contenedor] - `, message.data);
				}
				ws.send(JSON.stringify(message));
				// Reenviar mensaje a todos los clientes (frontend)
				// clients.forEach((client) => {
				// 	if (client.readyState === WebSocket.OPEN) {
				// 		client.send(JSON.stringify(message));
				// 	}
				// });
			} catch (error) {
				console.error("Error procesando mensaje:", error);
			}
		});

		ws.on("close", () => {
			console.log("Agente desconectado");
		});

		// if (!user || !session) {
		// 	ws.close();
		// 	return;
		// }

		try {
		} catch (error) {
			// @ts-ignore
			// const errorMessage = error?.message as unknown as string;
			// ws.send(errorMessage);
		}
	});
};

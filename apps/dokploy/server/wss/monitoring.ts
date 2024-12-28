import type http from "node:http";
import { WebSocket, WebSocketServer } from "ws";

interface MonitoringState {
	activeClients: Set<WebSocket>;
	agent: WebSocket | null;
	isCollecting: boolean;
}

const state: MonitoringState = {
	activeClients: new Set(),
	agent: null,
	isCollecting: false,
};

export const setupMonitoringWebSocketServer = (
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
	const wss = new WebSocketServer({
		noServer: true,
		path: "/agent",
	});

	const startMetricsCollection = () => {
		if (!state.agent || state.isCollecting) return;
		state.isCollecting = true;
		console.log(" Iniciando recolección de métricas");
		state.agent.send(JSON.stringify({ type: "start" }));
	};

	const stopMetricsCollection = () => {
		if (!state.agent || !state.isCollecting) return;
		state.isCollecting = false;
		console.log(" Deteniendo recolección de métricas");
		state.agent.send(JSON.stringify({ type: "stop" }));
	};

	server.on("upgrade", (req, socket, head) => {
		const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);
		console.log(" Solicitud de upgrade para:", pathname);

		if (pathname === "/_next/webpack-hmr") return;
		if (pathname === "/agent") {
			wss.handleUpgrade(req, socket, head, (ws) => {
				wss.emit("connection", ws, req);
			});
		}
	});

	wss.on("connection", (ws: WebSocket, req) => {
		console.log(" Nueva conexión desde:", req.socket.remoteAddress);

		ws.on("message", (data) => {
			try {
				const message = JSON.parse(data.toString());
				console.log(" Mensaje recibido:", message);

				switch (message.type) {
					case "register":
						if (message.data?.role === "agent") {
							console.log(" Agente registrado");
							state.agent = ws;
							// Si hay clientes esperando, iniciar métricas
							if (state.activeClients.size > 0) {
								startMetricsCollection();
							}
						} else if (message.data?.role === "client") {
							console.log(" Cliente conectado");
							state.activeClients.add(ws);
							// Si es el primer cliente y tenemos un agente, iniciar métricas
							if (state.activeClients.size === 1 && state.agent) {
								startMetricsCollection();
							}
						}
						break;

					case "metrics":
						console.log(
							" Métricas recibidas, reenviando a",
							state.activeClients.size,
							"clientes",
						);
						// Reenviar métricas a todos los clientes activos
						state.activeClients.forEach((client) => {
							if (client.readyState === WebSocket.OPEN) {
								client.send(data.toString());
							}
						});
						break;
				}
			} catch (error) {
				console.error(" Error procesando mensaje:", error);
			}
		});

		ws.on("close", () => {
			// Si era un cliente
			if (state.activeClients.has(ws)) {
				state.activeClients.delete(ws);
				console.log(
					" Cliente desconectado. Clientes restantes:",
					state.activeClients.size,
				);

				// Si no quedan clientes, detener métricas
				if (state.activeClients.size === 0) {
					stopMetricsCollection();
				}
			}
			// Si era el agente
			else if (ws === state.agent) {
				state.agent = null;
				state.isCollecting = false;
				console.log(" Agente desconectado");
			}
		});

		ws.on("error", (error) => {
			console.error(" Error en la conexión:", error);
		});
	});
};

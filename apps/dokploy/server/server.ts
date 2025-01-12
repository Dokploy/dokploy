import http from "node:http";
import { migration } from "@/server/db/migration";
import {
	IS_CLOUD,
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	initCronJobs,
	initializeNetwork,
	initializePostgres,
	initializeRedis,
	initializeTraefik,
	sendDokployRestartNotifications,
	setupDirectories,
} from "@dokploy/server";
import { config } from "dotenv";
import next from "next";
import { setupDockerContainerLogsWebSocketServer } from "./wss/docker-container-logs";
import { setupDockerContainerTerminalWebSocketServer } from "./wss/docker-container-terminal";
import { setupDockerStatsMonitoringSocketServer } from "./wss/docker-stats";
import { setupDeploymentLogsWebSocketServer } from "./wss/listen-deployment";
import { setupTerminalWebSocketServer } from "./wss/terminal";
import { WebSocketServer } from "ws";
import { createTRPCContext } from "@/server/api/trpc"; // Ruta a tu contexto tRPC
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { appRouter } from "./api/root";

config({ path: ".env" });
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, turbopack: process.env.TURBOPACK === "1" });
const handle = app.getRequestHandler();
void app.prepare().then(async () => {
	try {
		const server = http.createServer((req, res) => {
			handle(req, res);
		});

		const wss = new WebSocketServer({ noServer: true, path: "/prueba" });

		applyWSSHandler({
			wss,
			router: appRouter,
			createContext: createTRPCContext,
		});

		server.on("upgrade", (req, socket, head) => {
			const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);
			if (pathname === "/_next/webpack-hmr") {
				return;
			}
			// Handle tRPC WebSocket connections
			if (pathname === "/prueba") {
				// wss.handleUpgrade(req, socket, head, (ws) => {
				// 	wss.emit("connection", ws, req);
				// });
				wss.handleUpgrade(req, socket, head, function done(ws) {
					wss.emit("connection", ws, req);
				});
			}
		});

		wss.on("connection", async (ws, req) => {
			const url = new URL(req.url || "", `http://${req.headers.host}`);

			console.log("WebSocket connected");
		});

		// WEBSOCKET
		setupDeploymentLogsWebSocketServer(server);
		setupDockerContainerLogsWebSocketServer(server);
		setupDockerContainerTerminalWebSocketServer(server);
		setupTerminalWebSocketServer(server);
		if (!IS_CLOUD) {
			setupDockerStatsMonitoringSocketServer(server);
		}

		if (process.env.NODE_ENV === "production" && !IS_CLOUD) {
			setupDirectories();
			createDefaultMiddlewares();
			await initializeNetwork();
			createDefaultTraefikConfig();
			createDefaultServerTraefikConfig();
			await initializePostgres();
			await initializeTraefik();
			await initializeRedis();

			initCronJobs();

			// Timeout to wait for the database to be ready
			await new Promise((resolve) => setTimeout(resolve, 7000));
			await migration();
			await sendDokployRestartNotifications();
		}

		if (IS_CLOUD && process.env.NODE_ENV === "production") {
			await migration();
		}

		server.listen(PORT);
		console.log("Server Started:", PORT);
		if (!IS_CLOUD) {
			console.log("Starting Deployment Worker");
			const { deploymentWorker } = await import("./queues/deployments-queue");
			await deploymentWorker.run();
		}
	} catch (e) {
		console.error("Main Server Error", e);
	}
});

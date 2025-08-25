import http from "node:http";
import { db } from "@/server/db";
import { migration } from "@/server/db/migration";
import { server as serverTable } from "@/server/db/schema";
import {
	IS_CLOUD,
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	findAdmin,
	initCronJobs,
	initializeNetwork,
	initSchedules,
	initVolumeBackupsCronJobs,
	sendDokployRestartNotifications,
	setupDirectories,
} from "@dokploy/server";
import { config } from "dotenv";
import next from "next";
import {
	createDeploymentWorker,
	createServerDeploymentWorker,
} from "./queues/deployments-queue";
import { setupDockerContainerLogsWebSocketServer } from "./wss/docker-container-logs";
import { setupDockerContainerTerminalWebSocketServer } from "./wss/docker-container-terminal";
import { setupDockerStatsMonitoringSocketServer } from "./wss/docker-stats";
import { setupDrawerLogsWebSocketServer } from "./wss/drawer-logs";
import { setupDeploymentLogsWebSocketServer } from "./wss/listen-deployment";
import { setupTerminalWebSocketServer } from "./wss/terminal";

config({ path: ".env" });
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, turbopack: process.env.TURBOPACK === "1" });
const handle = app.getRequestHandler();
void app.prepare().then(async () => {
	try {
		const server = http.createServer((req, res) => {
			handle(req, res);
		});

		// WEBSOCKET
		setupDrawerLogsWebSocketServer(server);
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
			await migration();
			await initCronJobs();
			await initSchedules();
			await initVolumeBackupsCronJobs();
			await sendDokployRestartNotifications();
		}

		if (IS_CLOUD && process.env.NODE_ENV === "production") {
			await migration();
		}

		server.listen(PORT, HOST);
		console.log(`Server Started on: http://${HOST}:${PORT}`);
		if (!IS_CLOUD) {
			console.log("Starting Deployment Worker");
			try {
				let concurrency = 1;

				try {
					const admin = await findAdmin();
					concurrency = admin?.user?.buildsConcurrency || 1;
				} catch (error) {
					console.error(
						"Failed to find admin, might be first time running:",
						error,
					);
				}

				// Default/local deployment worker using user-level concurrency
				const worker = createDeploymentWorker(concurrency);

				if (!worker) {
					console.error("Failed to create main deployment worker");
				}

				// Create one worker per remote server with its own concurrency limit
				try {
					const remoteServers = await db.select().from(serverTable);
					for (const srv of remoteServers) {
						createServerDeploymentWorker(
							srv.serverId,
							srv.buildsConcurrency || 1,
						);
					}
				} catch (err) {
					console.error(
						"Failed to create deployment workers for servers:",
						err,
					);
				}
			} catch (error) {
				console.error("Failed to create deployment worker:", error);
			}
		}
	} catch (e) {
		console.error("Main Server Error", e);
	}
});

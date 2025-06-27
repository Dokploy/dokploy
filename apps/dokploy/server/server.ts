import http from "node:http";
import {
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	IS_CLOUD,
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
import { migration } from "@/server/db/migration";
import { createDeploymentWorker } from "./queues/deployments-queue";
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
				const admin = await findAdmin();

				const worker = createDeploymentWorker(
					admin?.user?.buildsConcurrency || 1,
				);
				console.log("Deployment Worker Started Successfully:", !!worker);
			} catch (error) {
				console.error("Failed to create deployment worker:", error);
			}
		}
	} catch (e) {
		console.error("Main Server Error", e);
	}
});

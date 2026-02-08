import http from "node:http";
import {
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	IS_CLOUD,
	initCancelDeployments,
	initCronJobs,
	initEnterpriseBackupCronJobs,
	initializeNetwork,
	initSchedules,
	initVolumeBackupsCronJobs,
	sendDokployRestartNotifications,
	setupDirectories,
} from "@dokploy/server";
import { config } from "dotenv";
import next from "next";
import packageInfo from "../package.json";
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

// Initialize critical directories and Traefik config BEFORE Next.js starts
// This prevents race conditions with the install script
if (process.env.NODE_ENV === "production" && !IS_CLOUD) {
	setupDirectories();
	createDefaultTraefikConfig();
	createDefaultServerTraefikConfig();
	console.log("✅ initialization complete");
}

const app = next({ dev, turbopack: process.env.TURBOPACK === "1" });
const handle = app.getRequestHandler();
void app.prepare().then(async () => {
	try {
		console.log("Running DokployVersion: ", packageInfo.version);
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
			createDefaultMiddlewares();
			await initializeNetwork();
			await initCronJobs();
			await initSchedules();
			await initCancelDeployments();
			await initVolumeBackupsCronJobs();
			await sendDokployRestartNotifications();
		}

		server.listen(PORT, HOST);
		console.log(`Server Started on: http://${HOST}:${PORT}`);
		await initEnterpriseBackupCronJobs();

		if (!IS_CLOUD) {
			console.log("Starting Deployment Worker");
			const { deploymentWorker } = await import("./queues/deployments-queue");
			await deploymentWorker.run();
		}
	} catch (e) {
		console.error("Main Server Error", e);
	}
});

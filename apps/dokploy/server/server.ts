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
import { deploymentWorker } from "./queues/deployments-queue";
import { setupDockerContainerLogsWebSocketServer } from "./wss/docker-container-logs";
import { setupDockerContainerTerminalWebSocketServer } from "./wss/docker-container-terminal";
import { setupDockerStatsMonitoringSocketServer } from "./wss/docker-stats";
import { setupDeploymentLogsWebSocketServer } from "./wss/listen-deployment";
import {
	getPublicIpWithFallback,
	setupTerminalWebSocketServer,
} from "./wss/terminal";

config({ path: ".env", override: true });
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
void app.prepare().then(async () => {
	try {
		const server = http.createServer((req, res) => {
			handle(req, res);
		});

		// WEBSOCKET
		setupDeploymentLogsWebSocketServer(server);
		setupDockerContainerLogsWebSocketServer(server);
		setupDockerContainerTerminalWebSocketServer(server);
		setupTerminalWebSocketServer(server);
		setupDockerStatsMonitoringSocketServer(server);

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
			welcomeServer();

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
			deploymentWorker.run();
		}
	} catch (e) {
		console.error("Main Server Error", e);
	}
});

async function welcomeServer() {
	const ip = await getPublicIpWithFallback();
	console.log(
		[
			"",
			"",
			"Dokploy server is up and running!",
			"Please wait for 15 seconds before opening the browser.",
			`    http://${ip}:${PORT}`,
			"",
			"",
		].join("\n"),
	);
}

import http from "node:http";
import { config } from "dotenv";
import next from "next";
import { deploymentWorker } from "./queues/deployments-queue";
import { initCronJobs } from "./utils/backups";
import {
	getPublicIpWithFallback,
	setupTerminalWebSocketServer,
} from "./wss/terminal";
import { setupDeploymentLogsWebSocketServer } from "./wss/listen-deployment";
import { setupDockerStatsMonitoringSocketServer } from "./wss/docker-stats";
import { setupDirectories } from "./setup/config-paths";
import { initializeNetwork, initializeSwarm } from "./setup/setup";
import {
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	initializeTraefik,
} from "./setup/traefik-setup";
import { initializeRedis } from "./setup/redis-setup";
import { initializePostgres } from "./setup/postgres-setup";
import { migration } from "@/server/db/migration";
import { setupDockerContainerLogsWebSocketServer } from "./wss/docker-container-logs";
import { setupDockerContainerTerminalWebSocketServer } from "./wss/docker-container-terminal";

config({ path: ".env" });
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
void app.prepare().then(async () => {
	try {
		const server = http.createServer((req, res) => {
			handle(req, res);
		});

		setupDirectories();
		createDefaultMiddlewares();
		await initializeNetwork();
		await initializeSwarm();
		createDefaultTraefikConfig();
		createDefaultServerTraefikConfig();
		await initializeTraefik();
		await initializeRedis();
		await initializePostgres();

		// WEBSOCKET
		setupDeploymentLogsWebSocketServer(server);
		setupDockerContainerLogsWebSocketServer(server);
		setupDockerContainerTerminalWebSocketServer(server);
		setupTerminalWebSocketServer(server);
		setupDockerStatsMonitoringSocketServer(server);
		if (process.env.NODE_ENV === "production") {
			// Cron Jobs
			initCronJobs();
			welcomeServer();

			await new Promise((resolve) => setTimeout(resolve, 7000));
			await migration();
		}
		server.listen(PORT);
		deploymentWorker.run();
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
			`    http://${ip}:3000`,
			"",
			"",
		].join("\n"),
	);
}

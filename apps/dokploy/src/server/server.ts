import http from "node:http";
import { config } from "dotenv";
import next from "next";
import { deploymentWorker } from "./queues/deployments-queue";
import { initCronJobs } from "./utils/backups";

import { setupDirectories } from "./setup/config-paths";
import { initializeNetwork } from "./setup/setup";
import {
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	initializeTraefik,
} from "./setup/traefik-setup";
import { initializeRedis } from "./setup/redis-setup";
import { initializePostgres } from "./setup/postgres-setup";
import { migration } from "@/server/db/migration";

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

		// WEBSOCKET

		if (process.env.NODE_ENV === "production") {
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
		}
		server.listen(PORT);
		console.log("Server Started:", PORT);
		deploymentWorker.run();
	} catch (e) {
		console.error("Main Server Error", e);
	}
});

async function welcomeServer() {
	console.log(
		[
			"",
			"",
			"Dokploy server is up and running!",
			"Please wait for 15 seconds before opening the browser.",
			// `    http://${ip}:${PORT}`,
			"",
			"",
		].join("\n"),
	);
}

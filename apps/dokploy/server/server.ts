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
import { deploymentWorker } from "./queues/deployments-queue";
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

		server.listen(PORT, HOST);
		console.log(`Server Started on: http://${HOST}:${PORT}`);
		if (process.env.NODE_ENV === "production" && !IS_CLOUD) {
			createDefaultMiddlewares();
			await initializeNetwork();
			await initCronJobs();
			await initSchedules();
			await initCancelDeployments();
			await initVolumeBackupsCronJobs();
			await sendDokployRestartNotifications();
		}
		await initEnterpriseBackupCronJobs();

		if (!IS_CLOUD) {
			console.log("Starting Deployment Worker");
			await deploymentWorker.run();
			const { deploymentQueueManager } = await import("./queues/queueSetup");
			await deploymentQueueManager.bootstrap();

			// Graceful shutdown: abort in-flight deployments so no rows are left
			// stuck in "running". `initCancelDeployments` sweeps on the *next*
			// boot — this closes the current process's window cleanly.
			//
			// We bound the drain to DEPLOYMENT_SHUTDOWN_GRACE_MS so a build that
			// ignores its abort signal can't prevent the process from exiting
			// (systemd / Docker will SIGKILL us after their own grace window;
			// we want to exit before that and let initCancelDeployments pick up
			// anything still marked running).
			const DRAIN_GRACE_MS = Number.parseInt(
				process.env.DEPLOYMENT_SHUTDOWN_GRACE_MS ?? "8000",
				10,
			);
			const shutdown = async (signal: string) => {
				console.log(`Received ${signal}, draining deployment queue…`);
				try {
					await Promise.race([
						deploymentWorker.close(`${signal} received`),
						new Promise<void>((_, reject) =>
							setTimeout(
								() => reject(new Error("drain timeout")),
								Number.isFinite(DRAIN_GRACE_MS)
									? Math.max(1000, DRAIN_GRACE_MS)
									: 8000,
							).unref?.(),
						),
					]);
				} catch (error) {
					console.error(
						"Deployment drain exceeded grace window or failed; exiting anyway.",
						error,
					);
				}
				process.exit(0);
			};
			process.once("SIGTERM", () => {
				void shutdown("SIGTERM");
			});
			process.once("SIGINT", () => {
				void shutdown("SIGINT");
			});
		}
	} catch (e) {
		console.error("Main Server Error", e);
	}
});

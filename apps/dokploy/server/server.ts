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

// Tracks whether the HTTP server has reached the "listening" state. Until then,
// any fatal error means the process can never serve requests and MUST exit(1) so
// the orchestrator restarts it cleanly. Without this, a startup failure (e.g. a
// rejected `app.prepare()`) leaves background handles — the Redis reconnect loop,
// open sockets — keeping the event loop alive, so the process never exits: it
// spins at ~100% CPU, the healthcheck never passes, and Docker Swarm crash-loops
// the container with only an opaque "ELIFECYCLE  Command failed." See issue #4253.
let isServerListening = false;

// Node terminates the process on an uncaught exception by default; preserve that
// but log the cause first so the failure point is never silent.
process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error);
	process.exit(1);
});

// A stray unhandled rejection BEFORE the server is listening means startup has
// failed — exit so we don't spin forever (see above). Once we are serving
// requests we only log, to avoid crashing an otherwise-healthy instance.
process.on("unhandledRejection", (reason) => {
	console.error("Unhandled rejection:", reason);
	if (!isServerListening) {
		process.exit(1);
	}
});

// Initialize critical directories and Traefik config BEFORE Next.js starts
// This prevents race conditions with the install script
if (process.env.NODE_ENV === "production" && !IS_CLOUD) {
	try {
		setupDirectories();
		createDefaultTraefikConfig();
		createDefaultServerTraefikConfig();
		console.log("✅ initialization complete");
	} catch (error) {
		console.error("Failed to initialize directories/Traefik config:", error);
		process.exit(1);
	}
}

const app = next({ dev, turbopack: process.env.TURBOPACK === "1" });
const handle = app.getRequestHandler();
void app
	.prepare()
	.then(async () => {
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

			// Wait for the bind to succeed (or fail, e.g. EADDRINUSE) before
			// continuing, so a listen failure exits cleanly instead of spinning.
			await new Promise<void>((resolve, reject) => {
				const onError = (error: Error) => reject(error);
				server.once("error", onError);
				server.listen(PORT, HOST, () => {
					server.removeListener("error", onError);
					resolve();
				});
			});
			isServerListening = true;
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
				const { deploymentWorker } = await import("./queues/deployments-queue");
				await deploymentWorker.run();
			}
		} catch (e) {
			console.error("Main Server Error", e);
			// If we failed before binding, the process can never serve traffic —
			// exit so the orchestrator restarts us instead of leaving it spinning.
			if (!isServerListening) {
				process.exit(1);
			}
		}
	})
	.catch((error) => {
		console.error("Failed to prepare Next.js app server:", error);
		process.exit(1);
	});

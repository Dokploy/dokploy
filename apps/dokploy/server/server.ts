import { migration } from "@/server/db/migration";
import {
	IS_CLOUD,
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	initCronJobs,
	initializeNetwork,
	sendDokployRestartNotifications,
	setupDirectories,
} from "@dokploy/server";
import {
	initializePostgres,
	initializeRedis,
	initializeSwarm,
	initializeTraefik,
} from "@dokploy/server/index";
import { config } from "dotenv";
import next from "next";
import http from "node:http";
import { setupDockerContainerLogsWebSocketServer } from "./wss/docker-container-logs";
import { setupDockerContainerTerminalWebSocketServer } from "./wss/docker-container-terminal";
import { setupDockerStatsMonitoringSocketServer } from "./wss/docker-stats";
import { setupDrawerLogsWebSocketServer } from "./wss/drawer-logs";
import { setupDeploymentLogsWebSocketServer } from "./wss/listen-deployment";
import { setupTerminalWebSocketServer } from "./wss/terminal";

config({ path: ".env" });
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, turbopack: process.env.TURBOPACK === "1" });
const handle = app.getRequestHandler();
app.prepare().then(async () => {
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
      console.log("🔃 [BOOTSTRAP]: Please wait...");
      await initializeSwarm();
      await initializeRedis().then(async () => {
        console.log("Redis Initialized");
        if (!IS_CLOUD) {
          console.log("Starting Deployment Worker");
          const { deploymentWorker } = await import(
            "./queues/deployments-queue"
          );
          setTimeout(async () => {
            await deploymentWorker.run();
          }, 1000 * 60 * 5);
          console.log("Redis Worker Initialized");
        }
      });
      await initializePostgres().then(async () => {
        console.log("Postgres Initialized");
        await migration();
        console.log("Postgres Migration Completed");
      });
      await initializeTraefik().then(async () => {
        console.log("Traefik Initialized");
        await initCronJobs();
        console.log("Cron Jobs Initialized");
      });
      await sendDokployRestartNotifications();
    }

    if (IS_CLOUD && process.env.NODE_ENV === "production") {
      await migration();
    }

    server.listen(PORT);
    console.log("Server Started:", PORT);
  } catch (e) {
    console.error("Main Server Error", e);
  }
});

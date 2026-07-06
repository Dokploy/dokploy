import type { IncomingMessage, ServerResponse } from "node:http";
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
import type { NextApiRequest, NextApiResponse } from "next";
import next from "next";
import packageInfo from "../package.json";
import { handleApplicationEnvUpsert } from "../pages/api/application.env.upsert";
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

type NodeNextApiResponse = ServerResponse & {
	status: (code: number) => NodeNextApiResponse;
	json: (body: unknown) => NodeNextApiResponse;
};

const normalizeRequestPath = (value: string) => {
	try {
		return new URL(value, "http://localhost").pathname.replace(/\/+$/, "");
	} catch {
		return "";
	}
};

const isApplicationEnvUpsertPath = (value: string) => {
	const pathname = normalizeRequestPath(value);

	return (
		pathname === "/api/application/env/upsert" ||
		pathname === "/api/application.env.upsert"
	);
};

const getForwardedUriValues = (req: IncomingMessage) => {
	const forwardedUri = req.headers["x-forwarded-uri"];

	if (Array.isArray(forwardedUri)) {
		return forwardedUri;
	}

	return typeof forwardedUri === "string" ? [forwardedUri] : [];
};

const isApplicationEnvUpsertRequest = (req: IncomingMessage) =>
	[req.url ?? "/", ...getForwardedUriValues(req)].some((path) =>
		isApplicationEnvUpsertPath(path),
	);

const readJsonBody = async (req: IncomingMessage) =>
	new Promise((resolve, reject) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			if (!body) {
				resolve({});
				return;
			}

			try {
				resolve(JSON.parse(body));
			} catch (error) {
				reject(error);
			}
		});
		req.on("error", reject);
	});

const handleApplicationEnvUpsertRequest = async (
	req: IncomingMessage,
	res: ServerResponse,
) => {
	try {
		(req as IncomingMessage & { body: unknown }).body = await readJsonBody(req);
	} catch {
		res.statusCode = 400;
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify({ message: "Invalid request body" }));
		return;
	}

	const nextResponse = res as NodeNextApiResponse;

	nextResponse.status = (code: number) => {
		res.statusCode = code;
		return nextResponse;
	};
	nextResponse.json = (body: unknown) => {
		if (!res.headersSent) {
			res.setHeader("Content-Type", "application/json");
		}
		res.end(JSON.stringify(body));
		return nextResponse;
	};

	try {
		await handleApplicationEnvUpsert(
			req as NextApiRequest,
			nextResponse as unknown as NextApiResponse,
		);
	} catch {
		if (!res.headersSent) {
			res.statusCode = 500;
			res.setHeader("Content-Type", "application/json");
		}
		res.end(JSON.stringify({ message: "Internal server error" }));
	}
};

void app.prepare().then(async () => {
	try {
		console.log("Running DokployVersion: ", packageInfo.version);
		const server = http.createServer((req, res) => {
			if (isApplicationEnvUpsertRequest(req)) {
				void handleApplicationEnvUpsertRequest(req, res);
				return;
			}

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
			const { deploymentWorker } = await import("./queues/deployments-queue");
			await deploymentWorker.run();
		}
	} catch (e) {
		console.error("Main Server Error", e);
	}
});

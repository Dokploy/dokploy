import http from "node:http";
import path from "node:path";
import {
	auth,
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
import { toNodeHandler } from "better-auth/node";
import { config } from "dotenv";
import openApiHandler from "@/pages/api/[...trpc]";
import deployRefreshTokenHandler from "@/pages/api/deploy/[refreshToken]";
import deployComposeHandler from "@/pages/api/deploy/compose/[refreshToken]";
import deployGithubHandler from "@/pages/api/deploy/github";
import healthHandler from "@/pages/api/health";
import giteaAuthorizeHandler from "@/pages/api/providers/gitea/authorize";
import giteaCallbackHandler from "@/pages/api/providers/gitea/callback";
import githubSetupHandler from "@/pages/api/providers/github/setup";
import githubWebhookHandler from "@/pages/api/providers/github/webhook";
import gitlabCallbackHandler from "@/pages/api/providers/gitlab/callback";
import stripeWebhookHandler from "@/pages/api/stripe/webhook";
import trpcHandler from "@/pages/api/trpc/[trpc]";
import { setupDockerContainerLogsWebSocketServer } from "@/server/wss/docker-container-logs";
import { setupDockerContainerTerminalWebSocketServer } from "@/server/wss/docker-container-terminal";
import { setupDockerStatsMonitoringSocketServer } from "@/server/wss/docker-stats";
import { setupDrawerLogsWebSocketServer } from "@/server/wss/drawer-logs";
import { setupDeploymentLogsWebSocketServer } from "@/server/wss/listen-deployment";
import { setupTerminalWebSocketServer } from "@/server/wss/terminal";
import packageInfo from "../package.json";
import { runNextApiHandler } from "./next-compat";
import { createStaticHandler } from "./static";

config({ path: ".env" });
config({ path: "../dokploy/.env" });

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const isProd = process.env.NODE_ENV === "production";

if (isProd && !IS_CLOUD) {
	setupDirectories();
	createDefaultTraefikConfig();
	createDefaultServerTraefikConfig();
	console.log("✅ initialization complete");
}

const authHandler = toNodeHandler(auth.handler);

const handleApi = async (
	req: http.IncomingMessage,
	res: http.ServerResponse,
	pathname: string,
) => {
	if (pathname === "/api/health") {
		return runNextApiHandler(healthHandler, req, res);
	}
	if (pathname.startsWith("/api/auth/")) {
		return authHandler(req, res);
	}
	if (pathname.startsWith("/api/trpc/")) {
		const trpc = decodeURIComponent(pathname.slice("/api/trpc/".length));
		return runNextApiHandler(trpcHandler, req, res, {
			params: { trpc },
			parseBody: false,
		});
	}
	if (pathname === "/api/deploy/github") {
		return runNextApiHandler(deployGithubHandler, req, res);
	}
	if (pathname === "/api/stripe/webhook") {
		return runNextApiHandler(stripeWebhookHandler, req, res, {
			parseBody: false,
		});
	}
	if (pathname === "/api/providers/github/setup") {
		return runNextApiHandler(githubSetupHandler, req, res);
	}
	if (pathname === "/api/providers/github/webhook") {
		return runNextApiHandler(githubWebhookHandler, req, res);
	}
	if (pathname === "/api/providers/gitlab/callback") {
		return runNextApiHandler(gitlabCallbackHandler, req, res);
	}
	if (pathname === "/api/providers/gitea/authorize") {
		return runNextApiHandler(giteaAuthorizeHandler, req, res);
	}
	if (pathname === "/api/providers/gitea/callback") {
		return runNextApiHandler(giteaCallbackHandler, req, res);
	}
	const composeMatch = pathname.match(/^\/api\/deploy\/compose\/([^/]+)$/);
	if (composeMatch?.[1]) {
		return runNextApiHandler(deployComposeHandler, req, res, {
			params: { refreshToken: composeMatch[1] },
		});
	}
	const deployMatch = pathname.match(/^\/api\/deploy\/([^/]+)$/);
	if (deployMatch?.[1]) {
		return runNextApiHandler(deployRefreshTokenHandler, req, res, {
			params: { refreshToken: deployMatch[1] },
		});
	}
	const segments = pathname
		.slice("/api/".length)
		.split("/")
		.filter(Boolean)
		.map(decodeURIComponent);
	return runNextApiHandler(openApiHandler, req, res, {
		params: { trpc: segments },
	});
};

const startServer = async () => {
	console.log("Running DokployVersion: ", packageInfo.version);

	let handleUi: (
		req: http.IncomingMessage,
		res: http.ServerResponse,
		url: URL,
	) => void = (_req, res) => {
		res.writeHead(503, { "content-type": "text/plain" });
		res.end("UI not ready");
	};

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url ?? "/", "http://localhost");
			if (url.pathname.startsWith("/api")) {
				await handleApi(req, res, url.pathname);
				return;
			}
			handleUi(req, res, url);
		} catch (error) {
			console.error("Request error", error);
			if (!res.headersSent) {
				res.writeHead(500, { "content-type": "text/plain" });
			}
			res.end("Internal Server Error");
		}
	});

	if (isProd) {
		handleUi = createStaticHandler(path.resolve(import.meta.dirname, "../dist"));
	} else {
		const { createServer: createViteServer } = await import("vite");
		const vite = await createViteServer({
			root: path.resolve(import.meta.dirname, ".."),
			configFile: path.resolve(import.meta.dirname, "../vite.config.ts"),
			appType: "spa",
			server: { middlewareMode: true, hmr: { server } },
		});
		handleUi = (req, res) => {
			vite.middlewares(req, res, () => {
				res.statusCode = 404;
				res.end();
			});
		};
		console.log("Vite dev middleware enabled (UI + HMR on this port)");
	}

	setupDrawerLogsWebSocketServer(server);
	setupDeploymentLogsWebSocketServer(server);
	setupDockerContainerLogsWebSocketServer(server);
	setupDockerContainerTerminalWebSocketServer(server);
	setupTerminalWebSocketServer(server);
	if (!IS_CLOUD) {
		setupDockerStatsMonitoringSocketServer(server);
	}

	server.listen(PORT, HOST);
	console.log(`Standalone Server Started on: http://${HOST}:${PORT}`);

	if (isProd && !IS_CLOUD) {
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
		const { startDeploymentWorker } = await import(
			"@/server/queues/queueSetup"
		);
		await startDeploymentWorker();
	}
};

startServer().catch((error) => {
	console.error("Main Server Error", error);
});

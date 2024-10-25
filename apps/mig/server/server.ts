import {
	IS_CLOUD,
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	getPublicIpWithFallback,
	initCronJobs,
	initializeNetwork,
	initializePostgres,
	initializeRedis,
	initializeTraefik,
	sendDokployRestartNotifications,
	setupDirectories,
} from "@dokploy/server";
import { createRequestHandler } from "@remix-run/express";
import { installGlobals } from "@remix-run/node";
import express from "express";

installGlobals();

const viteDevServer =
	process.env.NODE_ENV === "production"
		? undefined
		: await import("vite").then((vite) =>
				vite.createServer({
					server: { middlewareMode: true },
				}),
			);

const app = express();

// handle asset requests
if (viteDevServer) {
	app.use(viteDevServer.middlewares);
} else {
	app.use(
		"/assets",
		express.static("build/client/assets", {
			immutable: true,
			maxAge: "1y",
		}),
	);
}
app.use(express.static("build/client", { maxAge: "1h" }));

// handle SSR requests
app.all(
	"*",
	createRequestHandler({
		build: viteDevServer
			? () => viteDevServer.ssrLoadModule("virtual:remix/server-build")
			: await import("../build/server/index.js"),
	}),
);

const port = 3000;
app.listen(port, async () => {
	if (!IS_CLOUD) {
		// setupDockerStatsMonitoringSocketServer(server);
	}

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
		// await migration();
		await sendDokployRestartNotifications();
	}

	if (IS_CLOUD && process.env.NODE_ENV === "production") {
		// await migration();
	}

	// server.listen(PORT);
	// console.log("Server Started:", PORT);
	if (!IS_CLOUD) {
		console.log("Starting Deployment Worker");
		// const { deploymentWorker } = await import("./queues/deployments-queue");
		// await deploymentWorker.run();
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
			`    http://${ip}:${3000}`,
			"",
			"",
		].join("\n"),
	);
}

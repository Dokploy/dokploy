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
import { setupDockerContainerLogsWebSocketServer } from "./wss/docker-container-logs";
import { setupDockerContainerTerminalWebSocketServer } from "./wss/docker-container-terminal";
import { generateOpenAPIDocumentFromTRPCRouter } from "openapi-trpc";
import { appRouter } from "./api/root";
import { getDokployVersion } from "./api/services/settings";

export const doc = generateOpenAPIDocumentFromTRPCRouter(appRouter, {
	pathPrefix: "/api/trpc",
	processOperation(op) {
		op.security = [{ bearerAuth: [] }];
	},
});
doc.components = {
	securitySchemes: {
		bearerAuth: {
			type: "http",
			scheme: "bearer",
			bearerFormat: "JWT",
		},
	},
};
doc.info = {
	title: "Dokploy API",
	description: "Endpoints for dokploy",
	version: getDokployVersion(),
};

config({ path: ".env" });
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
void app.prepare().then(async () => {
	try {
		const server = http.createServer((req, res) => {
			if (req.method === "GET" && req.url === "/trpc.json") {
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify(doc)); // Asegúrate de definir `doc`
				return;
			}
			if (req.method === "GET" && req.url === "/trpc") {
				res.setHeader("Content-Type", "text/html");
				res.end(`<!DOCTYPE html>
					<html lang="en">
					  <head>
						<meta charset="utf-8" />
						<meta name="viewport" content="width=device-width, initial-scale=1" />
						<meta name="description" content="SwaggerUI" />
						<title>SwaggerUI</title>
						<link href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@4.15.5/swagger-ui.min.css" rel="stylesheet" />
						<link href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@4.17.0/favicon-32x32.png" rel="icon" />
					  </head>
					  <body>
						<div id="swagger-ui"></div>
						<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@4.15.5/swagger-ui-bundle.js"></script>
						<script>
						  window.onload = () => {
							const ui = SwaggerUIBundle({
							  url: '/trpc.json',
							  dom_id: '#swagger-ui',
							  presets: [
								SwaggerUIBundle.presets.apis,
								SwaggerUIBundle.SwaggerUIStandalonePreset
							  ],
							  layout: "BaseLayout",
							  requestInterceptor: (request) => {
								const token = localStorage.getItem('bearerToken');
								if (token) {
								  request.headers['Authorization'] = 'Bearer ' + token;
								}
								return request;
							  }
							});
	
							ui.initOAuth({
							  persistAuthorization: true
							});
	
							// Store the token in local storage when set in Swagger UI
							ui.authActions.authorize({
							  bearerAuth: {
								name: "bearerAuth",
								value: localStorage.getItem('bearerToken') || '',
								schema: {
								  type: "http",
								  scheme: "bearer",
								  bearerFormat: "JWT"
								}
							  }
							});
	
							ui.authSelectors.oauth().authorize({
							  bearerAuth: {
								token: localStorage.getItem('bearerToken') || ''
							  }
							});
	
							window.ui = ui;
	
							// Save token to localStorage
							const tokenInput = document.querySelector('input[placeholder="Bearer token"]');
							tokenInput.addEventListener('change', (event) => {
							  localStorage.setItem('bearerToken', event.target.value);
							});
						  };
						</script>
					  </body>
					</html>`);
				return;
			}
			handle(req, res);
		});

		// WEBSOCKET
		setupDeploymentLogsWebSocketServer(server);
		setupDockerContainerLogsWebSocketServer(server);
		setupDockerContainerTerminalWebSocketServer(server);
		setupTerminalWebSocketServer(server);
		setupDockerStatsMonitoringSocketServer(server);

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

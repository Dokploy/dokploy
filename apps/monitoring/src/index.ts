import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logServerMetrics } from "./monitoring/server.js";
import { config } from "dotenv";
import { serverLogFile, containerLogFile } from "./constants.js";
import { processMetricsFromFile } from "./utils.js";
import { logContainerMetrics } from "./monitoring/containers.js";
import { existsSync } from "node:fs";
config();

const TOKEN = process.env.TOKEN || "default-token";
const app = new Hono();

const origin =
	process.env.NODE_ENV === "production"
		? "https://dokploy.com"
		: "http://localhost:3000";
// Configurar CORS
app.use(
	"*",
	cors({
		origin: "*",
		credentials: true,
	}),
);

logServerMetrics();
logContainerMetrics();

app.use("/*", cors());
// app.use(
// 	"/*",
// 	bearerAuth({
// 		token: TOKEN,
// 	}),
// );
app.use(async (c, next) => {
	if (c.req.path === "/health") {
		return next();
	}
	// const authHeader = c.req.header("x-token");

	// if (TOKEN !== authHeader) {
	// 	return c.json({ message: "Invalid API Key" }, 403);
	// }

	return next();
});

app.get("/", (c) => {
	return c.text("Hello Hono!");
});

app.get("/metrics", async (c) => {
	try {
		const metrics = await processMetricsFromFile(serverLogFile, {
			start: c.req.query("start"),
			end: c.req.query("end"),
			limit: Number(c.req.query("limit")) || undefined,
		});

		return c.json(metrics);
	} catch (error) {
		console.error("Error reading metrics:", error);
		return c.json({ error: "Error reading metrics" }, 500);
	}
});

app.get("/metrics/containers", async (c) => {
	try {
		const appName = c.req.query("appName");
		if (!appName) {
			return c.json({ error: "No appName provided" }, 400);
		}

		const logPath = `${containerLogFile}/${appName}.log`;

		if (existsSync(logPath) === false) {
			return c.json([]);
		}
		const metrics = await processMetricsFromFile(logPath, {
			start: c.req.query("start"),
			end: c.req.query("end"),
			limit: Number(c.req.query("limit")) || undefined,
		});

		return c.json(metrics);
	} catch (error) {
		console.error("Error reading metrics:", error);
		return c.json({ error: "Error reading metrics" }, 500);
	}
});

app.get("/health", (c) => {
	return c.text("OK");
});

const port = Number(process.env.PORT || 3001);
console.log(`Server is running on http://localhost:${port}`);

serve({
	fetch: app.fetch,
	port,
});

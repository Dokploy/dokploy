import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logServerMetrics } from "./socket.js";
import fs from "node:fs/promises";
import { config } from "dotenv";
import { serverLogFile } from "./constants.js";
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
		const serverMetrics = await fs.readFile(serverLogFile, "utf8");
		const parsedServerMetrics = parseLog(serverMetrics);
		const start = c.req.query("start");
		const end = c.req.query("end");
		const filteredServerMetrics = filterByTimestamp(
			parsedServerMetrics,
			start,
			end,
		);
		return c.json(filteredServerMetrics);
	} catch (error) {
		console.error("Error leyendo métricas del servidor:", error);
		return c.json({ error: "Failed to read server metrics" }, 500);
	}
});

const port = 3001;
console.log(`Server is running on http://localhost:${port}`);

serve({
	fetch: app.fetch,
	port,
});

logServerMetrics();
// logContainerMetrics();

function parseLog(logContent: string) {
	const lines = logContent.trim().split("\n");
	// Devolver solo los últimos 100 registros por defecto
	return lines.slice(-100).map((line) => {
		try {
			return JSON.parse(line);
		} catch {
			return { raw: line };
		}
	});
}

function filterByTimestamp(metrics: any[], start?: string, end?: string) {
	// Si no hay filtros, devolver todo
	if (!start && !end) {
		return metrics.sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);
	}

	// Convertir a timestamp (si existen)
	const startTime = start ? new Date(start).getTime() : null;
	const endTime = end ? new Date(end).getTime() : null;

	return metrics
		.filter((metric) => {
			const metricTime = new Date(metric.timestamp).getTime();

			if (startTime && endTime) {
				return metricTime >= startTime && metricTime <= endTime;
			}
			if (startTime) {
				return metricTime >= startTime;
			}
			if (endTime) {
				return metricTime <= endTime;
			}
			return true;
		})
		.sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);
}

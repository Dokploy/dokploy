import type { Context } from "hono";
import { serverLogFile } from "./constants.js";
import { processMetricsFromFile } from "./utils.js";

export async function metricsHandler(c: Context) {
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
}

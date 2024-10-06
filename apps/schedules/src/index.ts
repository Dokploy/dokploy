import { serve } from "@hono/node-server";
import { Hono } from "hono";
import "dotenv/config";
import { zValidator } from "@hono/zod-validator";
import { jobQueueSchema } from "./schema";
import { firstWorker, secondWorker } from "./workers";
import { logger } from "./logger";
import { cleanQueue, removeJob, scheduleJob } from "./queue";

const app = new Hono();

cleanQueue();

app.post("/create-backup", zValidator("json", jobQueueSchema), (c) => {
	const data = c.req.valid("json");
	scheduleJob(data);

	logger.info("Backup created successfully", data);
	return c.json({ message: "Backup created successfully" });
});

app.post("/remove-job", zValidator("json", jobQueueSchema), async (c) => {
	const data = c.req.valid("json");
	const result = await removeJob(data);
	logger.info("Job removed successfully", data);
	return c.json({ message: "Job removed successfully", result });
});

app.get("/health", async (c) => {
	return c.json({ status: "ok" });
});

export const gracefulShutdown = async (signal: string) => {
	logger.warn(`Received ${signal}, closing server...`);
	await firstWorker.close();
	await secondWorker.close();
	process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
	logger.error(err, "Uncaught exception");
});

process.on("unhandledRejection", (reason, promise) => {
	logger.error({ promise, reason }, "Unhandled Rejection at: Promise");
});

const port = Number.parseInt(process.env.PORT || "3000");

logger.info("Starting Schedules Server ✅", port);
serve({ fetch: app.fetch, port });

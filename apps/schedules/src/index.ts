import { serve } from "@hono/node-server";
import { Hono } from "hono";
import "dotenv/config";
import { zValidator } from "@hono/zod-validator";
import { logger } from "./logger.js";
import {
	cleanQueue,
	getJobRepeatable,
	removeJob,
	scheduleJob,
} from "./queue.js";
import { jobQueueSchema } from "./schema.js";
import { initializeJobs } from "./utils.js";
import { firstWorker, secondWorker } from "./workers.js";

const app = new Hono();

cleanQueue();
initializeJobs();

app.use(async (c, next) => {
	if (c.req.path === "/health") {
		return next();
	}
	const authHeader = c.req.header("X-API-Key");

	if (process.env.API_KEY !== authHeader) {
		return c.json({ message: "Invalid API Key" }, 403);
	}

	return next();
});

app.post("/create-backup", zValidator("json", jobQueueSchema), async (c) => {
	const data = c.req.valid("json");
	scheduleJob(data);
	logger.info({ data }, `[${data.type}]  created successfully`);
	return c.json({ message: `[${data.type}]  created successfully` });
});

app.post("/update-backup", zValidator("json", jobQueueSchema), async (c) => {
	const data = c.req.valid("json");
	const job = await getJobRepeatable(data);
	if (job) {
		let result = false;
		if (data.type === "backup") {
			result = await removeJob({
				backupId: data.backupId,
				type: "backup",
				cronSchedule: job.pattern,
			});
		} else if (data.type === "server") {
			result = await removeJob({
				serverId: data.serverId,
				type: "server",
				cronSchedule: job.pattern,
			});
		} else if (data.type === "schedule") {
			result = await removeJob({
				scheduleId: data.scheduleId,
				type: "schedule",
				cronSchedule: job.pattern,
			});
		} else if (data.type === "volume-backup") {
			result = await removeJob({
				volumeBackupId: data.volumeBackupId,
				type: "volume-backup",
				cronSchedule: job.pattern,
			});
		}
		logger.info({ result }, "Job removed");
	}
	scheduleJob(data);
	logger.info("Backup updated successfully");

	return c.json({ message: "Backup updated successfully" });
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

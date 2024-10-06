import { serve } from "@hono/node-server";
import { Hono } from "hono";
import "dotenv/config";
import { zValidator } from "@hono/zod-validator";
import { logger } from "./logger";
import { cleanQueue, getJobRepeatable, removeJob, scheduleJob } from "./queue";
import { jobQueueSchema } from "./schema";
import { firstWorker, secondWorker } from "./workers";
import { validateBearerTokenAPI } from "@dokploy/server";

const app = new Hono();

cleanQueue();

app.use(async (c, next) => {
	const authHeader = c.req.header("authorization");

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return c.json({ message: "Authorization header missing" }, 401);
	}

	const result = await validateBearerTokenAPI(authHeader);

	if (!result.user || !result.session) {
		return c.json({ message: "Invalid session" }, 403);
	}
	return next();
});

app.post("/create-backup", zValidator("json", jobQueueSchema), async (c) => {
	const data = c.req.valid("json");
	scheduleJob(data);
	logger.info("Backup created successfully", data);
	return c.json({ message: "Backup created successfully" });
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
		}
		logger.info("Job removed", result);
	}
	scheduleJob(data);

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

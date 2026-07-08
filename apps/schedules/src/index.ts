import { serve } from "@hono/node-server";
import { Hono } from "hono";
import "dotenv/config";
import { assertSignedScheduledQueueJob } from "@dokploy/server/utils/schedules/signed-job";
import { zValidator } from "@hono/zod-validator";
import { isValidApiKey } from "./auth.js";
import { logger } from "./logger.js";
import {
	cleanQueue,
	getJobRepeatable,
	removeJob,
	removeRepeatableJob,
	scheduleJob,
} from "./queue.js";
import { signedJobQueueSchema } from "./schema.js";
import { initializeJobs } from "./utils.js";
import { firstWorker, secondWorker, thirdWorker } from "./workers.js";

const app = new Hono();

cleanQueue();
initializeJobs();

app.use(async (c, next) => {
	if (c.req.path === "/health") {
		return next();
	}
	const authHeader = c.req.header("X-API-Key");

	if (!isValidApiKey(process.env.API_KEY, authHeader)) {
		return c.json({ message: "Invalid API Key" }, 403);
	}

	return next();
});

app.post(
	"/create-backup",
	zValidator("json", signedJobQueueSchema),
	async (c) => {
		const data = await assertSignedScheduledQueueJob(c.req.valid("json"), {
			operation: "create",
		});
		await scheduleJob(data);
		logger.info({ data }, `[${data.type}]  created successfully`);
		return c.json({ message: `[${data.type}]  created successfully` });
	},
);

app.post(
	"/update-backup",
	zValidator("json", signedJobQueueSchema),
	async (c) => {
		const data = await assertSignedScheduledQueueJob(c.req.valid("json"), {
			operation: "update",
		});
		const job = await getJobRepeatable(data);
		if (job) {
			const result = await removeRepeatableJob(job);
			logger.info({ result }, "Job removed");
		}
		await scheduleJob(data);
		logger.info("Backup updated successfully");

		return c.json({ message: "Backup updated successfully" });
	},
);

app.post("/remove-job", zValidator("json", signedJobQueueSchema), async (c) => {
	const data = await assertSignedScheduledQueueJob(c.req.valid("json"), {
		operation: "remove",
		requireEnabled: false,
		requireFreshScope: false,
	});
	const result = await removeJob(data);
	logger.info({ data }, "Job removed successfully");
	return c.json({ message: "Job removed successfully", result });
});

app.get("/health", async (c) => {
	return c.json({ status: "ok" });
});

export const gracefulShutdown = async (signal: string) => {
	logger.warn(`Received ${signal}, closing server...`);
	await firstWorker.close();
	await secondWorker.close();
	await thirdWorker.close();
	process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
	logger.error(err, "Uncaught exception");
});

process.on("unhandledRejection", (reason, _promise) => {
	logger.error(
		reason instanceof Error ? reason : { reason: String(reason) },
		"Unhandled Rejection at: Promise",
	);
});

const port = Number.parseInt(process.env.PORT || "3000", 10);

logger.info({ port }, "Starting Schedules Server ✅");
serve({ fetch: app.fetch, port });

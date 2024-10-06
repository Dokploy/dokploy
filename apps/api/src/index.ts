import { serve } from "@hono/node-server";
import { Hono } from "hono";
import "dotenv/config";
import { createClient } from "redis";
import { Queue } from "@nerimity/mimiqueue";
import { zValidator } from "@hono/zod-validator";
import { type DeployJob, deployJobSchema } from "./schema";
import { deploy } from "./utils";
import { logger } from "./logger";

const app = new Hono();
const redisClient = createClient({
	url: process.env.REDIS_URL,
});

app.post("/deploy", zValidator("json", deployJobSchema), (c) => {
	const data = c.req.valid("json");
	const res = queue.add(data, { groupName: data.serverId });
	return c.json(
		{
			message: "Deployment Added",
		},
		200,
	);
});

app.get("/health", async (c) => {
	return c.json({ status: "ok" });
});

const queue = new Queue({
	name: "deployments",
	process: async (job: DeployJob) => {
		logger.info("Deploying job", job);
		return await deploy(job);
	},
	redisClient,
});

(async () => {
	await redisClient.connect();
	await redisClient.flushAll();
	logger.info("Cleaning Redis");
})();

const port = Number.parseInt(process.env.PORT || "3000");
logger.info("Starting Deployments Server ✅", port);
serve({ fetch: app.fetch, port });

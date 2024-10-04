import { serve } from "@hono/node-server";
import { Hono } from "hono";
import "dotenv/config";
import { createClient } from "redis";
import { Queue } from "@nerimity/mimiqueue";
import { zValidator } from "@hono/zod-validator";
import { type DeployJob, deployJobSchema } from "./schema";
import { deploy } from "./utils";

const app = new Hono();
const redisClient = createClient({
	url: process.env.REDIS_URL,
});

app.post("/deploy", zValidator("json", deployJobSchema), (c) => {
	const data = c.req.valid("json");
	queue.add(data, { groupName: data.serverId }).then((res) => {
		console.log(res);
	});
	return c.json(
		{
			message: "Deployment started",
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
		console.log(job);
		return await deploy(job);
	},
	redisClient,
});
const port = Number.parseInt(process.env.PORT || "3000");

(async () => {
	await redisClient.connect();
	await redisClient.flushAll();
})();

console.log("Starting Server ✅", port);
serve({ fetch: app.fetch, port });

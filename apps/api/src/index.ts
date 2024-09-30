import { serve } from "@hono/node-server";
import { Hono } from "hono";
import "dotenv/config";
import { createClient } from "redis";
import { Queue } from "@nerimity/mimiqueue";
import { deployApplication } from "@dokploy/builders";

const app = new Hono();
const redisClient = createClient({
	// socket: {
	// 	host: "localhost",
	// 	port: 6379,
	// },
	url: process.env.REDIS_URL,
	// password: "xlfvpQ0ma2BkkkPX",
});

app.post("/publish", async (c) => {
	const { userId, applicationId } = await c.req.json();
	queue
		.add(
			{
				userId,
				applicationId,
			},
			{ groupName: userId },
		)
		.then((res) => {
			console.log(res);
		});

	return c.json({ message: `Despliegue encolado para el usuario ${userId}` });
});
// await redisClient.connect();
// await redisClient.flushAll();

const queue = new Queue({
	name: "deployments",
	process: async (data) => {
		// await setTimeout(8000);
		await deployApplication({
			applicationId: data.applicationId,
			titleLog: "HHHHH",
			descriptionLog: "",
		});
		return { done: "lol", data };
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

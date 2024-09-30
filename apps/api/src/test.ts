// import { Hono } from "hono";
// import { Client } from "@upstash/qstash";
// import { serve } from "@hono/node-server";
// import dotenv from "dotenv";
// import Redis from "ioredis";

// dotenv.config();

// const redis = new Redis({
// 	host: "localhost",
// 	port: 7777,
// 	password: "xlfvpQ0ma2BkkkPX",
// });

// // redis.set("test", "test");
// // console.log(await redis.get("test"));

// // console.log(await redis.get("user-1-processing"));
// const app = new Hono();
// console.log("QStash Token:", process.env.PUBLIC_URL);

// const qstash = new Client({
// 	token: process.env.QSTASH_TOKEN as string,
// });

// const queue = qstash.queue({
// 	queueName: "deployments",
// });

// // Endpoint que publica un mensaje en QStash
// app.post("/enqueue", async (c) => {
// 	const { userId, deploymentId } = await c.req.json();
// 	const response = await qstash.publishJSON({
// 		url: `${process.env.PUBLIC_URL}/process`, // Endpoint para procesar la tarea
// 		body: { userId, deploymentId }, // Datos del despliegue

// 	});

// 	return c.json({ message: "Task enqueued", id: response.messageId });
// });

// // Endpoint que recibe el mensaje procesado
// app.post("/process", async (c) => {
// 	const { userId, deploymentId } = await c.req.json();

// 	const isProcessing = await redis.get(`user-${userId}-processing`);
// 	console.log(`isProcessing for user ${userId}:`, isProcessing);

// 	if (isProcessing === "true") {
// 		console.log(
// 			`User ${userId} is already processing a deployment. Queuing the next one.`,
// 		);
// 		return c.json(
// 			{
// 				status: "User is already processing a deployment, waiting...",
// 			},
// 			{
// 				status: 400,
// 			},
// 		);
// 	}
// 	redis.set(`user-${userId}-processing`, "true");

// 	try {
// 		await new Promise((resolve) => setTimeout(resolve, 5000));
// 	} catch (error) {
// 	} finally {
// 		await redis.del(`user-${userId}-processing`);
// 	}

// 	return c.json({ status: "Processed", userId, deploymentId });
// });

// // Inicia el servidor en el puerto 3000
// const port = 3000;
// console.log(`Server is running on port http://localhost:${port}`);

// serve({
// 	fetch: app.fetch,
// 	port,
// });
// // 18

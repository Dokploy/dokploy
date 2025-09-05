import { serve } from "@hono/node-server";
import { Hono } from "hono";
import "dotenv/config";
import { zValidator } from "@hono/zod-validator";
import { Inngest } from "inngest";
import { serve as serveInngest } from "inngest/hono";
import { logger } from "./logger.js";
import { type DeployJob, deployJobSchema } from "./schema.js";
import { deploy } from "./utils.js";

const app = new Hono();

// Initialize Inngest client
export const inngest = new Inngest({
	id: "dokploy-deployments",
	name: "Dokploy Deployment Service",
});

export const deploymentFunction = inngest.createFunction(
	{
		id: "deploy-application",
		name: "Deploy Application",
		concurrency: [
			{
				key: "event.data.serverId",
				limit: 1,
			},
		],
		retries: 0,
	},
	{ event: "deployment/requested" },

	async ({ event, step }) => {
		const jobData = event.data as DeployJob;

		return await step.run("execute-deployment", async () => {
			logger.info("Deploying started");

			try {
				const result = await deploy(jobData);
				logger.info("Deployment finished", result);

				// Send success event
				await inngest.send({
					name: "deployment/completed",
					data: {
						...jobData,
						result,
						status: "success",
					},
				});

				return result;
			} catch (error) {
				logger.error("Deployment failed", { jobData, error });

				// Send failure event
				await inngest.send({
					name: "deployment/failed",
					data: {
						...jobData,
						error: error instanceof Error ? error.message : String(error),
						status: "failed",
					},
				});

				throw error;
			}
		});
	},
);

app.use(async (c, next) => {
	if (c.req.path === "/health" || c.req.path === "/api/inngest") {
		return next();
	}

	const authHeader = c.req.header("X-API-Key");

	if (process.env.API_KEY !== authHeader) {
		return c.json({ message: "Invalid API Key" }, 403);
	}

	return next();
});

app.post("/deploy", zValidator("json", deployJobSchema), async (c) => {
	const data = c.req.valid("json");
	logger.info("Received deployment request", data);

	try {
		// Send event to Inngest instead of adding to Redis queue
		await inngest.send({
			name: "deployment/requested",
			data,
		});

		logger.info("Deployment event sent to Inngest", {
			serverId: data.serverId,
		});

		return c.json(
			{
				message: "Deployment Added to Inngest Queue",
				serverId: data.serverId,
			},
			200,
		);
	} catch (error) {
		console.log("error", error);
		logger.error("Failed to send deployment event", error);
		return c.json(
			{
				message: "Failed to queue deployment",
				error: error instanceof Error ? error.message : String(error),
			},
			500,
		);
	}
});

app.get("/health", async (c) => {
	return c.json({ status: "ok" });
});

// Serve Inngest functions endpoint
app.on(
	["GET", "POST", "PUT"],
	"/api/inngest",
	serveInngest({
		client: inngest,
		functions: [deploymentFunction],
	}),
);

const port = Number.parseInt(process.env.PORT || "3000");
logger.info("Starting Deployments Server with Inngest ✅", port);
serve({ fetch: app.fetch, port });

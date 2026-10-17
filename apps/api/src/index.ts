import {
	cancelQueuedDeployment,
	deploymentAttemptSchema,
	executeDeployment,
	failDeploymentJob,
} from "@dokploy/server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import "dotenv/config";
import { zValidator } from "@hono/zod-validator";
import { Inngest } from "inngest";
import { serve as serveInngest } from "inngest/hono";
import { dispatchDeployments } from "./dispatch.js";
import { logger } from "./logger.js";
import { deployJobSchema } from "./schema.js";
import { fetchDeploymentJobs } from "./service.js";

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
		onFailure: async ({ event, error }) => {
			const job = deployJobSchema.parse(event.data.event.data);
			await failDeploymentJob(job, error);
		},
	},
	{ event: "deployment/requested" },

	async ({ event, step }) => {
		const jobData = deployJobSchema.parse(event.data);

		return await step.run("execute-deployment", async () => {
			logger.info("Deploying started");

			try {
				const result = await executeDeployment(jobData);
				if (!result) return false;
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

export const dispatchPendingDeploymentsFunction = inngest.createFunction(
	{ id: "dispatch-pending-deployments", concurrency: 1 },
	{ cron: "* * * * *" },
	async ({ step }) => {
		for (let batch = 0; ; batch++) {
			const count = await step.run(`dispatch-${batch}`, () =>
				dispatchDeployments(inngest),
			);
			if (count < 100) return;
		}
	},
);

// Inngest operators may also cancel a run before it starts. An executing step
// cannot be interrupted, so its row remains running until the worker finishes.
export const cancelledDeploymentFunction = inngest.createFunction(
	{ id: "record-cancelled-deployment" },
	{
		event: "inngest/function.cancelled",
		if: "event.data.function_id == 'dokploy-deployments-deploy-application'",
	},
	async ({ event }) => {
		const { deploymentId } = deploymentAttemptSchema.parse(
			event.data.event.data,
		);
		await cancelQueuedDeployment(deploymentId);
	},
);

app.use(async (c, next) => {
	if (c.req.path === "/health" || c.req.path === "/api/inngest") {
		return next();
	}

	const authHeader = c.req.header("X-API-Key");

	if (!process.env.API_KEY || process.env.API_KEY !== authHeader) {
		return c.json({ message: "Invalid API Key" }, 403);
	}

	return next();
});

app.post("/deploy", zValidator("json", deploymentAttemptSchema), async (c) => {
	const { deploymentId } = c.req.valid("json");
	try {
		await dispatchDeployments(inngest, deploymentId);
		return c.json({ message: "Deployment delivery accepted", deploymentId });
	} catch (error) {
		logger.error(
			{ error, deploymentId },
			"Deployment remains queued for delivery",
		);
		return c.json(
			{ message: "Deployment remains queued for delivery", deploymentId },
			503,
		);
	}
});

app.post(
	"/cancel-deployment",
	zValidator("json", deploymentAttemptSchema),
	async (c) => {
		const data = c.req.valid("json");
		logger.info("Received cancel deployment request", data);

		try {
			if (!(await cancelQueuedDeployment(data.deploymentId))) {
				return c.json(
					{
						message:
							"Only queued deployments can be cancelled. Running builds must finish.",
					},
					409,
				);
			}

			return c.json({
				message: "Queued deployment cancelled",
				deploymentId: data.deploymentId,
			});
		} catch (error) {
			logger.error({ error }, "Failed to cancel queued deployment");
			return c.json(
				{
					message: "Failed to cancel deployment",
					error: error instanceof Error ? error.message : String(error),
				},
				500,
			);
		}
	},
);

app.get("/health", async (c) => {
	return c.json({ status: "ok" });
});

// List deployment jobs (Inngest runs) for a server - same shape as BullMQ queue for the UI
app.get("/jobs", async (c) => {
	const serverId = c.req.query("serverId");
	if (!serverId) {
		return c.json({ message: "serverId is required" }, 400);
	}

	try {
		const rows = await fetchDeploymentJobs(serverId);
		return c.json(rows);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("INNGEST_BASE_URL")) {
			return c.json(
				{ message: "INNGEST_BASE_URL is required to list deployment jobs" },
				503,
			);
		}
		logger.error("Failed to fetch jobs from Inngest", { serverId, error });
		return c.json([], 200);
	}
});

// Serve Inngest functions endpoint
app.on(
	["GET", "POST", "PUT"],
	"/api/inngest",
	serveInngest({
		client: inngest,
		functions: [
			deploymentFunction,
			dispatchPendingDeploymentsFunction,
			cancelledDeploymentFunction,
		],
	}),
);

const port = Number.parseInt(process.env.PORT || "3000");
logger.info("Starting Deployments Server with Inngest ✅", port);
serve({ fetch: app.fetch, port });

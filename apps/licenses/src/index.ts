import { serve } from "@hono/node-server";
import { Hono } from "hono";
import "dotenv/config";
import { zValidator } from "@hono/zod-validator";
import { logger } from "./logger.js";
import { deployJobSchema } from "./schema.js";
import Stripe from "stripe";
const app = new Hono();

app.post("/deploy", zValidator("json", deployJobSchema), (c) => {
	const data = c.req.valid("json");
	return c.json(
		{
			message: "Deployment Added",
		},
		200,
	);
});

// Stripe webhook
app.post("/stripe/webhook", async (c) => {
	const body = await c.req.json();

	const event = stripe.webhooks.constructEvent(
		body,
		c.req.header("stripe-signature"),
		process.env.STRIPE_WEBHOOK_SECRET,
	);

	return c.json({ status: "ok" });
});

app.get("/health", async (c) => {
	return c.json({ status: "ok" });
});

const port = Number.parseInt(process.env.PORT || "3000");
logger.info("Starting Deployments Server ✅", port);
serve({ fetch: app.fetch, port });

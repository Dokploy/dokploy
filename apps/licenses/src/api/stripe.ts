import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createCheckoutSessionSchema } from "../validators/stripe";
import { getStripeItems } from "../utils/license";
import { stripe } from "../stripe";
import { WEBSITE_URL } from "../constants";
import { logger } from "../logger";
import { eq } from "drizzle-orm";
import { licenses } from "../schema";
import { db } from "../db";
import { getLicenseFeatures, getLicenseTypeFromPriceId } from "../utils";
import { z } from "zod";
import type Stripe from "stripe";
import { createLicense } from "../utils/license";
import { render } from "@react-email/render";
import { LicenseEmail } from "../../templates/emails/license-email";
import { transporter } from "../email";

export const stripeRouter = new Hono();

stripeRouter.post(
	"/create-checkout-session",
	zValidator("json", createCheckoutSessionSchema),
	async (c) => {
		const { type, serverQuantity, isAnnual } = c.req.valid("json");

		const items = getStripeItems(type, serverQuantity, isAnnual);
		const session = await stripe.checkout.sessions.create({
			mode: "subscription",
			line_items: items,
			allow_promotion_codes: true,
			success_url: `${WEBSITE_URL}/license/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${WEBSITE_URL}#pricing`,
		});

		return c.json({ sessionId: session.id });
	},
);

stripeRouter.get(
	"/get-license-from-session",
	zValidator("query", z.object({ sessionId: z.string().min(1) })),
	async (c) => {
		const { sessionId } = c.req.valid("query");
		console.log("Session ID", sessionId);

		if (!sessionId) {
			return c.json({ error: "Session ID is required" }, 400);
		}

		try {
			const session = await stripe.checkout.sessions.retrieve(sessionId);
			if (session.status !== "complete") {
				return c.json({ error: "Session is not complete" }, 400);
			}

			const subscription = await stripe.subscriptions.retrieve(
				session.subscription as string,
			);

			const license = await db.query.licenses.findFirst({
				where: eq(licenses.stripeSubscriptionId, subscription.id),
			});

			const priceId = subscription.items.data[0].price.id;
			const { type, billingType } = getLicenseTypeFromPriceId(priceId);

			return c.json({ type, billingType, key: license?.licenseKey });
		} catch (error) {
			logger.error("Error retrieving session:", error);
			return c.json({ error: "Error retrieving session" }, 400);
		}
	},
);

stripeRouter.post("/webhook", async (c) => {
	const rawBody = await c.req.raw.text();
	const sig = c.req.header("stripe-signature");

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(
			rawBody,
			sig!,
			process.env.STRIPE_WEBHOOK_SECRET!,
		);
	} catch (err) {
		logger.error("Webhook signature verification failed:", err);
		return c.json({ error: "Webhook signature verification failed" }, 400);
	}

	const allowedEvents = ["invoice.paid"];

	if (!allowedEvents.includes(event.type)) {
		return c.json({ error: "Event not allowed" }, 400);
	}

	try {
		switch (event.type) {
			case "invoice.paid": {
				const invoice = event.data.object as Stripe.Invoice;

				if (!invoice.subscription) break;

				if (invoice.billing_reason === "subscription_create") {
					const customerResponse = await stripe.customers.retrieve(
						invoice.customer as string,
					);

					if (customerResponse.deleted) {
						throw new Error("Customer was deleted");
					}

					const subscriptionId = invoice.subscription as string;
					const subscription =
						await stripe.subscriptions.retrieve(subscriptionId);
					const priceId = subscription.items.data[0].price.id;
					const { type } = getLicenseTypeFromPriceId(priceId);

					const { license, user } = await createLicense({
						productId: subscriptionId,
						email: customerResponse.email!.toLowerCase(),
						stripeCustomerId: customerResponse.id,
						stripeSubscriptionId: subscriptionId,
					});

					const features = getLicenseFeatures(type);
					const emailHtml = await render(
						LicenseEmail({
							customerName: customerResponse.name || "Customer",
							licenseKey: license.licenseKey,
							productName: `Dokploy Self Hosted ${type}`,
							features: features,
						}),
					);

					await transporter.sendMail({
						from: process.env.SMTP_FROM_ADDRESS,
						to: user.email,
						subject: "Your Dokploy License Key ",
						html: emailHtml,
					});
				}

				break;
			}
		}

		return c.json({ received: true });
	} catch (error) {
		console.error("Error processing webhook:", error);
		if (error instanceof Error) {
			return c.json({ error: error.message }, 500);
		}
		return c.json({ error: "Unknown error occurred" }, 500);
	}
});

stripeRouter.post(
	"/create-customer-portal-session",
	zValidator("json", z.object({ customerId: z.string().min(1) })),
	async (c) => {
		try {
			const { customerId } = c.req.valid("json");

			console.log("Customer ID", customerId);

			const session = await stripe.billingPortal.sessions.create({
				customer: customerId,
				return_url: `${WEBSITE_URL}/dashboard/settings/billing`,
			});

			return c.json({ url: session.url });
		} catch (error) {
			logger.error("Error creating customer portal session:", error);
			return c.json({ error: "Error creating customer portal session" }, 500);
		}
	},
);

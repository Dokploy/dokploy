import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { logger } from "./logger";
import { render } from "@react-email/render";
import { LicenseEmail } from "../templates/emails/license-email";
import { ResendLicenseEmail } from "../templates/emails/resend-license-email";
import {
	createLicense,
	validateLicense,
	activateLicense,
	deactivateLicense,
	getStripeItems,
} from "./utils/license";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { licenses } from "./schema";
import "dotenv/config";
import { getLicenseFeatures, getLicenseTypeFromPriceId } from "./utils";
import { transporter } from "./email";
import type Stripe from "stripe";
import { stripe } from "./stripe";
import { WEBSITE_URL } from "./constants";
import { createCheckoutSessionSchema } from "./validators/stripe";

const app = new Hono();
const router = new Hono();
router.use(
	"/*",
	cors({
		origin: ["http://localhost:3001"],
	}),
);

const validateSchema = z.object({
	licenseKey: z.string(),
	serverIp: z.string(),
});

const resendSchema = z.object({
	licenseKey: z.string(),
});

router.get("/health", async (c) => {
	try {
		await db.execute(sql`SELECT 1`);
		return c.json({ status: "ok" });
	} catch (error) {
		logger.error("Database connection error:", error);
		return c.json({ status: "error" }, 500);
	}
});

router.post("/validate", zValidator("json", validateSchema), async (c) => {
	const { licenseKey, serverIp } = c.req.valid("json");

	try {
		const result = await validateLicense(licenseKey, serverIp);
		console.log("Result", result);
		return c.json(result);
	} catch (error) {
		logger.error("Error validating license:", { error });
		return c.json({ isValid: false, error: "Error validating license" }, 500);
	}
});

router.post("/activate", zValidator("json", validateSchema), async (c) => {
	const { licenseKey, serverIp } = c.req.valid("json");

	try {
		const license = await activateLicense(licenseKey, serverIp);
		return c.json({ success: true, license });
	} catch (error) {
		logger.error("Error activating license:", error);
		if (error instanceof Error) {
			return c.json({ success: false, error: error.message }, 400);
		}
		return c.json({ success: false, error: "Unknown error occurred" }, 400);
	}
});

router.post(
	"/create-checkout-session",
	zValidator("json", createCheckoutSessionSchema),
	async (c) => {
		const { type, serverQuantity, isAnnual } = c.req.valid("json");

		const items = getStripeItems(type, serverQuantity, isAnnual);
		const session = await stripe.checkout.sessions.create({
			mode: "subscription",
			line_items: items,
			allow_promotion_codes: true,
			success_url: `${WEBSITE_URL}/license/success`,
			cancel_url: `${WEBSITE_URL}#pricing`,
		});

		return c.json({ sessionId: session.id });
	},
);

router.post("/resend-license", zValidator("json", resendSchema), async (c) => {
	const { licenseKey } = c.req.valid("json");

	try {
		const license = await db.query.licenses.findFirst({
			where: eq(licenses.licenseKey, licenseKey),
		});

		if (!license) {
			return c.json({ success: false, error: "License not found" }, 404);
		}

		const emailHtml = await render(
			ResendLicenseEmail({
				licenseKey: license.licenseKey,
				productName: `Dokploy Self Hosted ${license.type}`,
				// TODO: Add expiration date
				expirationDate: new Date(),
				requestDate: new Date(),
				customerName: license.email,
			}),
		);

		await transporter.sendMail({
			from: process.env.SMTP_FROM_ADDRESS,
			to: license.email,
			subject: "Your Dokploy License Key",
			html: emailHtml,
		});

		return c.json({ success: true });
	} catch (error) {
		logger.error("Error resending license:", error);
		return c.json({ success: false, error: "Error resending license" }, 500);
	}
});
router.post("/stripe/webhook", async (c) => {
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

	const allowedEvents = [
		"checkout.session.completed",
		"customer.subscription.updated",
		"invoice.payment_succeeded",
		"invoice.payment_failed",
		"customer.subscription.deleted",
		"invoice.paid",
	];

	if (!allowedEvents.includes(event.type)) {
		return c.json({ error: "Event not allowed" }, 400);
	}

	try {
		switch (event.type) {
			case "customer.subscription.updated": {
				const subscription = event.data.object as Stripe.Subscription;

				const customerResponse = await stripe.customers.retrieve(
					subscription.customer as string,
				);

				if (subscription.status !== "active" || customerResponse.deleted) {
					await deactivateLicense(subscription.id);
				}
				break;
			}

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
					const { type, billingType } = getLicenseTypeFromPriceId(priceId);

					const license = await createLicense({
						productId: subscriptionId,
						type,
						billingType,
						email: customerResponse.email!,
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
						to: license.email,
						subject: "Your Dokploy License Key ",
						html: emailHtml,
					});
				}

				break;
			}

			case "invoice.payment_succeeded": {
				const invoice = event.data.object as Stripe.Invoice;

				if (!invoice.subscription) break;

				const suscription = await stripe.subscriptions.retrieve(
					invoice.subscription as string,
				);

				const customerResponse = await stripe.customers.retrieve(
					invoice.customer as string,
				);
				if (suscription.status !== "active" || customerResponse.deleted) {
					await deactivateLicense(invoice.subscription as string);
					break;
				}

				const existingLicense = await db.query.licenses.findFirst({
					where: eq(licenses.stripeCustomerId, invoice.customer as string),
				});

				if (!existingLicense) break;

				await db
					.update(licenses)
					.set({
						status: "active",
					})
					.where(eq(licenses.id, existingLicense.id));

				break;
			}

			case "invoice.payment_failed": {
				const invoice = event.data.object as Stripe.Invoice;

				if (!invoice.subscription) break;

				const subscription = await stripe.subscriptions.retrieve(
					invoice.subscription as string,
				);

				if (subscription.status !== "active") {
					await deactivateLicense(subscription.id);
				}

				break;
			}

			case "customer.subscription.deleted": {
				const subscription = event.data.object as Stripe.Subscription;

				const existingLicense = await db.query.licenses.findFirst({
					where: eq(licenses.stripeCustomerId, subscription.customer as string),
				});

				if (!existingLicense) break;

				await db
					.update(licenses)
					.set({
						status: "cancelled",
					})
					.where(eq(licenses.id, existingLicense.id));

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

app.route("/api", router);
const port = process.env.PORT || 4002;
console.log(`Server is running on port http://localhost:${port}`);

serve({
	fetch: app.fetch,
	port: Number(port),
});

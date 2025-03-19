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
} from "./utils/license";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { licenses } from "./schema";
import "dotenv/config";
import { getLicenseFeatures, getLicenseTypeFromPriceId } from "./utils";
import { transporter } from "./email";
import type Stripe from "stripe";
import { stripe } from "./stripe";

const app = new Hono();
app.use("/*", cors());

const validateSchema = z.object({
	licenseKey: z.string(),
	serverIp: z.string(),
});

const resendSchema = z.object({
	licenseKey: z.string(),
});

app.get("/health", async (c) => {
	try {
		await db.execute(sql`SELECT 1`);
		return c.json({ status: "ok" });
	} catch (error) {
		logger.error("Database connection error:", error);
		return c.json({ status: "error" }, 500);
	}
});

app.post("/validate", zValidator("json", validateSchema), async (c) => {
	const { licenseKey, serverIp } = c.req.valid("json");

	try {
		const result = await validateLicense(licenseKey, serverIp);
		return c.json(result);
	} catch (error) {
		logger.error("Error validating license:", error);
		return c.json({ isValid: false, error: "Error validating license" }, 500);
	}
});

app.post("/activate", zValidator("json", validateSchema), async (c) => {
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

app.post("/resend-license", zValidator("json", resendSchema), async (c) => {
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
				expirationDate: new Date(license.expiresAt),
				requestDate: new Date(),
				customerName: license.email,
			}),
		);

		await transporter.sendMail({
			from: process.env.SMTP_FROM,
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

app.post("/stripe/webhook", async (c) => {
	const sig = c.req.header("stripe-signature");
	const body = await c.req.json();

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(
			JSON.stringify(body),
			sig!,
			process.env.STRIPE_WEBHOOK_SECRET!,
		);
	} catch (err) {
		logger.error("Webhook signature verification failed:", err);
		return c.json({ error: "Webhook signature verification failed" }, 400);
	}

	try {
		switch (event.type) {
			case "checkout.session.completed": {
				const session = event.data.object as Stripe.Checkout.Session;

				const customerResponse = await stripe.customers.retrieve(
					session.customer as string,
				);

				if (customerResponse.deleted) {
					throw new Error("Customer was deleted");
				}

				const lineItems = await stripe.checkout.sessions.listLineItems(
					session.id,
				);
				const priceId = lineItems.data[0].price?.id;

				const { type, billingType } = getLicenseTypeFromPriceId(priceId!);

				const license = await createLicense({
					productId: session.id,
					type,
					billingType,
					email: session.customer_details?.email!,
					stripeCustomerId: customerResponse.id,
					stripeSubscriptionId: session.id,
				});

				const features = getLicenseFeatures(type);
				const emailHtml = await render(
					LicenseEmail({
						customerName: customerResponse.name || "Customer",
						licenseKey: license.licenseKey,
						productName: `Dokploy Self Hosted ${type}`,
						expirationDate: new Date(license.expiresAt),
						features: features,
					}),
				);

				await transporter.sendMail({
					from: process.env.SMTP_FROM,
					to: license.email,
					subject: "Your Dokploy License Key",
					html: emailHtml,
				});

				break;
			}

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

			case "invoice.payment_succeeded": {
				const invoice = event.data.object as Stripe.Invoice;

				if (!invoice.subscription) break;

				const suscription = await stripe.subscriptions.retrieve(
					invoice.subscription as string,
				);

				const customerResponse = await stripe.customers.retrieve(
					invoice.customer as string,
				);
				if (suscription.status !== "active" || customerResponse.deleted) break;

				const existingLicense = await db.query.licenses.findFirst({
					where: eq(licenses.stripeCustomerId, invoice.customer as string),
				});

				if (!existingLicense) break;

				const newExpirationDate = new Date();
				newExpirationDate.setMonth(
					newExpirationDate.getMonth() +
						(existingLicense.billingType === "annual" ? 12 : 1),
				);

				await db
					.update(licenses)
					.set({
						expiresAt: newExpirationDate,
						status: "active",
					})
					.where(eq(licenses.id, existingLicense.id));

				const features = getLicenseFeatures(existingLicense.type);
				const emailHtml = await render(
					LicenseEmail({
						customerName: customerResponse.name || "Customer",
						licenseKey: existingLicense.licenseKey,
						productName: `Dokploy Self Hosted ${existingLicense.type}`,
						expirationDate: new Date(newExpirationDate),
						features: features,
					}),
				);

				await transporter.sendMail({
					from: process.env.SMTP_FROM,
					to: existingLicense.email,
					subject: "Your Dokploy License Has Been Renewed",
					html: emailHtml,
				});

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
		logger.error("Error processing webhook:", error);
		if (error instanceof Error) {
			return c.json({ error: error.message }, 500);
		}
		return c.json({ error: "Unknown error occurred" }, 500);
	}
});

const port = process.env.PORT || 4000;
console.log(`Server is running on port ${port}`);

serve({
	fetch: app.fetch,
	port: Number(port),
});

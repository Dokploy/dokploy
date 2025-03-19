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
} from "./utils/license";
import { db } from "./db";
import { eq } from "drizzle-orm";
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

		// Generar el email
		const emailHtml = await render(
			ResendLicenseEmail({
				customerName: license.customerId,
				licenseKey: license.licenseKey,
				productName: `Dokploy Self Hosted ${license.type}`,
				expirationDate: new Date(license.expiresAt),
				requestDate: new Date(),
			}),
		);

		// Enviar el email
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
					customerId: customerResponse.id,
					productId: session.id,
					type,
					billingType,
					email: session.customer_details?.email!,
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

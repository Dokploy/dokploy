import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
	activateLicense,
	deactivateLicense,
	validateLicense,
	cleanLicense,
} from "../utils/license";
import { logger } from "../logger";
import { eq, desc } from "drizzle-orm";
import { users, licenses } from "../schema";
import { db } from "../db";
import { transporter } from "../email";
import { nanoid } from "nanoid";
import { stripe } from "../stripe";
import type Stripe from "stripe";
import { getLicenseTypeFromPriceId } from "../utils";
const validateSchema = z.object({
	licenseKey: z.string(),
	serverIp: z.string(),
});

export const licenseRouter = new Hono();

licenseRouter.post(
	"/validate",
	zValidator("json", validateSchema),
	async (c) => {
		const { licenseKey, serverIp } = c.req.valid("json");

		try {
			const result = await validateLicense(licenseKey, serverIp);
			return c.json(result);
		} catch (error) {
			logger.error("Error validating license:", { error });
			return c.json({ success: false, error: "Error validating license" }, 500);
		}
	},
);

licenseRouter.post(
	"/activate",
	zValidator("json", validateSchema),
	async (c) => {
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
	},
);

licenseRouter.post(
	"/deactivate",
	zValidator("json", validateSchema),
	async (c) => {
		const { licenseKey, serverIp } = c.req.valid("json");

		try {
			const license = await deactivateLicense(licenseKey, serverIp);
			return c.json({ success: true, license });
		} catch (error) {
			logger.error("Error deactivating license:", error);
			return c.json(
				{ success: false, error: "Error deactivating license" },
				500,
			);
		}
	},
);

licenseRouter.post(
	"/remove-server",
	zValidator(
		"json",
		z.object({ licenseKey: z.string().min(1), serverIp: z.string().min(1) }),
	),
	async (c) => {
		const { licenseKey, serverIp } = c.req.valid("json");

		try {
			const license = await cleanLicense(licenseKey, serverIp);
			return c.json({ success: true, license });
		} catch (error) {
			logger.error("Error cleaning license:", error);
			return c.json({ success: false, error: "Error cleaning license" }, 500);
		}
	},
);
// router.post("/resend-license", zValidator("json", resendSchema), async (c) => {
// 	const { licenseKey } = c.req.valid("json");

// 	try {
// 		const license = await db.query.licenses.findFirst({
// 			where: eq(licenses.licenseKey, licenseKey),
// 		});

// 		if (!license) {
// 			return c.json({ success: false, error: "License not found" }, 404);
// 		}

// 		const suscription = await stripe.subscriptions.retrieve(
// 			license.stripeSubscriptionId,
// 		);

// 		const priceId = suscription.items.data[0].price.id;
// 		const { type } = getLicenseTypeFromPriceId(priceId);

// 		const emailHtml = await render(
// 			ResendLicenseEmail({
// 				licenseKey: license.licenseKey,
// 				productName: `Dokploy Self Hosted ${type}`,
// 				requestDate: new Date(),
// 				customerName: license.email,
// 			}),
// 		);

// 		await transporter.sendMail({
// 			from: process.env.SMTP_FROM_ADDRESS,
// 			to: license.email,
// 			subject: "Your Dokploy License Key",
// 			html: emailHtml,
// 		});

// 		return c.json({ success: true });
// 	} catch (error) {
// 		logger.error("Error resending license:", error);
// 		return c.json({ success: false, error: "Error resending license" }, 500);
// 	}
// });

licenseRouter.post(
	"/send-otp",
	zValidator("json", z.object({ email: z.string().email() })),
	async (c) => {
		const { email } = c.req.valid("json");

		const user = await db.query.users.findFirst({
			where: eq(users.email, email.toLowerCase()),
		});

		if (!user) {
			return c.json({ success: false, error: "User not found" }, 404);
		}

		const generateOtpCode = Math.floor(100000 + Math.random() * 900000);
		const otpCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

		await db
			.update(users)
			.set({ otpCode: generateOtpCode.toString(), otpCodeExpiresAt })
			.where(eq(users.id, user.id));

		await transporter.sendMail({
			from: process.env.SMTP_FROM_ADDRESS,
			to: user.email,
			subject: "Your Dokploy License Key ",
			html: `Your OTP code is ${generateOtpCode}, it will expire in 10 minutes`,
		});

		return c.json({ success: true });
	},
);

licenseRouter.post(
	"/verify-otp",
	zValidator(
		"json",
		z.object({ email: z.string().email(), otpCode: z.string().length(6) }),
	),
	async (c) => {
		const { email, otpCode } = c.req.valid("json");

		const user = await db.query.users.findFirst({
			where: eq(users.email, email.toLowerCase()),
		});

		if (!user) {
			return c.json({ success: false, error: "User not found" }, 404);
		}

		if (user.otpCode !== otpCode) {
			return c.json({ success: false, error: "Invalid code" }, 400);
		}

		if (user.otpCodeExpiresAt && user.otpCodeExpiresAt < new Date()) {
			return c.json({ success: false, error: "Code expired" }, 400);
		}

		const result = await db
			.update(users)
			.set({
				otpCode: null,
				otpCodeExpiresAt: null,
				temporalId: nanoid(),
				temporalIdExpiresAt: new Date(Date.now() + 20 * 60 * 1000),
			})
			.where(eq(users.id, user.id))
			.returning();

		return c.json({ success: true, temporalId: result[0].temporalId });
	},
);

licenseRouter.get(
	"/all",
	zValidator("query", z.object({ temporalId: z.string() })),
	async (c) => {
		const { temporalId } = c.req.valid("query");

		const user = await db.query.users.findFirst({
			where: eq(users.temporalId, temporalId),
			with: {
				licenses: true,
			},
			orderBy: desc(licenses.createdAt),
		});

		if (!user) {
			return c.json({ success: false, error: "User not found" }, 404);
		}

		if (user.temporalIdExpiresAt && user.temporalIdExpiresAt < new Date()) {
			return c.json({ success: false, error: "Session expired" }, 400);
		}

		const suscriptions: Stripe.Subscription[] = [];
		for (const license of user.licenses) {
			const suscription = await stripe.subscriptions.retrieve(
				license.stripeSubscriptionId,
			);

			suscriptions.push(suscription);
		}

		const formated = user.licenses.map((license) => {
			const suscription = suscriptions.find(
				(suscription) => suscription.id === license.stripeSubscriptionId,
			);

			const { type } = getLicenseTypeFromPriceId(
				suscription?.items.data[0].price.id || "",
			);

			return {
				license: license,
				stripeSuscription: {
					quantity: suscription?.items.data[0].quantity,
					billingType: suscription?.items.data[0].price.recurring?.interval,
					type: type,
				},
			};
		});

		return c.json({ success: true, licenses: formated });
	},
);

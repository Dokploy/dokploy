import { randomBytes } from "node:crypto";
import { db } from "../db";
import { licenses } from "../schema";
import { eq } from "drizzle-orm";
import { stripe } from "../stripe";
import type Stripe from "stripe";

export const generateLicenseKey = () => {
	return randomBytes(32).toString("hex");
};

interface CreateLicenseProps {
	productId: string;
	type: "basic" | "premium" | "business";
	billingType: "monthly" | "annual";
	email: string;
	stripeCustomerId: string;
	stripeSubscriptionId: string;
}

export const createLicense = async ({
	productId,
	type,
	billingType,
	email,
	stripeCustomerId,
	stripeSubscriptionId,
}: CreateLicenseProps) => {
	const licenseKey = `dokploy-${generateLicenseKey()}`;

	const license = await db
		.insert(licenses)
		.values({
			productId,
			licenseKey,
			type,
			billingType,
			email,
			stripeCustomerId,
			stripeSubscriptionId,
		})
		.returning();

	return license[0];
};

export const validateLicense = async (
	licenseKey: string,
	serverIp?: string,
) => {
	const license = await db.query.licenses.findFirst({
		where: eq(licenses.licenseKey, licenseKey),
	});

	if (!license) {
		return { isValid: false, error: "License not found" };
	}

	const suscription = await stripe.subscriptions.retrieve(
		license.stripeSubscriptionId,
	);

	if (suscription.status !== "active") {
		return {
			isValid: false,
			error: `License is ${getLicenseStatus(suscription)}`,
		};
	}

	if (license.serverIp && serverIp && license.serverIp !== serverIp) {
		return { isValid: false, error: "Invalid server IP" };
	}

	await db
		.update(licenses)
		.set({ lastVerifiedAt: new Date() })
		.where(eq(licenses.id, license.id));

	return { isValid: true, license };
};

export const activateLicense = async (licenseKey: string, serverIp: string) => {
	const license = await db.query.licenses.findFirst({
		where: eq(licenses.licenseKey, licenseKey),
	});

	if (!license) {
		throw new Error("License not found");
	}

	const suscription = await stripe.subscriptions.retrieve(
		license.stripeSubscriptionId,
	);

	if (suscription.status !== "active") {
		throw new Error(`License is ${getLicenseStatus(suscription)}`);
	}

	if (license.serverIp && license.serverIp !== serverIp) {
		throw new Error("License is already activated on a different server");
	}

	// Activate the license with the server IP
	const updatedLicense = await db
		.update(licenses)
		.set({
			serverIp,
			activatedAt: new Date(),
			lastVerifiedAt: new Date(),
		})
		.where(eq(licenses.id, license.id))
		.returning();

	return updatedLicense[0];
};

export const deactivateLicense = async (stripeSubscriptionId: string) => {
	const license = await db.query.licenses.findFirst({
		where: eq(licenses.stripeSubscriptionId, stripeSubscriptionId),
	});

	if (!license) {
		throw new Error("License not found");
	}

	await db
		.update(licenses)
		.set({ status: "cancelled" })
		.where(eq(licenses.id, license.id));
};

export const getLicenseStatus = async (license: Stripe.Subscription) => {
	if (license.status === "active") {
		return "active";
	}

	if (license.status === "canceled") {
		return "canceled";
	}

	if (license.status === "incomplete") {
		return "incomplete";
	}

	if (license.status === "incomplete_expired") {
		return "incomplete expired";
	}

	if (license.status === "past_due") {
		return "past due";
	}

	if (license.status === "paused") {
		return "paused";
	}

	if (license.status === "trialing") {
		return "trialing";
	}

	if (license.status === "unpaid") {
		return "unpaid";
	}

	return "unknown";
};

export const getStripeItems = (
	type: "basic" | "premium" | "business",
	serverQuantity: number,
	isAnnual: boolean,
) => {
	const items = [];

	if (type === "basic") {
		items.push({
			price: isAnnual
				? process.env.SELF_HOSTED_BASIC_PRICE_ANNUAL_ID
				: process.env.SELF_HOSTED_BASIC_PRICE_MONTHLY_ID,
			quantity: serverQuantity,
		});
	} else if (type === "premium") {
		items.push({
			price: isAnnual
				? process.env.SELF_HOSTED_PREMIUM_PRICE_ANNUAL_ID
				: process.env.SELF_HOSTED_PREMIUM_PRICE_MONTHLY_ID,
			quantity: serverQuantity,
		});
	} else if (type === "business") {
		items.push({
			price: isAnnual
				? process.env.SELF_HOSTED_BUSINESS_PRICE_ANNUAL_ID
				: process.env.SELF_HOSTED_BUSINESS_PRICE_MONTHLY_ID,
			quantity: serverQuantity,
		});

		return items;
	}

	return items;
};

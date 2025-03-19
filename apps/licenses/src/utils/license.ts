import { randomBytes } from "node:crypto";
import { db } from "../db";
import { type License, licenses } from "../schema";
import { eq } from "drizzle-orm";

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
	const expiresAt = new Date();
	expiresAt.setMonth(
		expiresAt.getMonth() + (billingType === "annual" ? 12 : 1),
	);

	const license = await db
		.insert(licenses)
		.values({
			productId,
			licenseKey,
			type,
			billingType,
			expiresAt,
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

	if (license.status !== "active") {
		return {
			isValid: false,
			error: `License is ${getLicenseStatus(license)}`,
		};
	}

	if (new Date() > license.expiresAt) {
		await db
			.update(licenses)
			.set({ status: "expired" })
			.where(eq(licenses.id, license.id));
		return { isValid: false, error: "License has expired" };
	}

	if (license.serverIp && serverIp && license.serverIp !== serverIp) {
		return { isValid: false, error: "Invalid server IP" };
	}

	// Update last verified timestamp
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

	if (license.status !== "active") {
		throw new Error("License is not active");
	}

	if (new Date() > license.expiresAt) {
		await db
			.update(licenses)
			.set({ status: "expired" })
			.where(eq(licenses.id, license.id));
		throw new Error("License has expired");
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

export const getLicenseStatus = (license: License) => {
	if (license.status === "active") {
		return "active";
	}

	if (license.status === "expired") {
		return "expired";
	}

	if (license.status === "cancelled") {
		return "cancelled";
	}

	if (license.status === "payment_pending") {
		return "pending payment";
	}
};

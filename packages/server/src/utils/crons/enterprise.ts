import { getPublicIpWithFallback } from "@dokploy/server/wss/utils";
import { and, eq, isNotNull } from "drizzle-orm";
import { scheduleJob } from "node-schedule";
import { db } from "../../db/index";
import { user as userSchema } from "../../db/schema/user";

export const initEnterpriseBackupCronJobs = async () => {
	scheduleJob("enterprise-check", "0 0 */3 * *", async () => {
		const users = await db.query.user.findMany({
			where: and(
				isNotNull(userSchema.licenseKey),
				isNotNull(userSchema.enableEnterpriseFeatures),
				eq(userSchema.isValidEnterpriseLicense, true),
			),
		});
		for (const user of users) {
			if (user.isValidEnterpriseLicense) {
				console.log(
					"Validating license key....",
					user.firstName,
					user.lastName,
				);
				try {
					const isValid = await validateLicenseKey(user.licenseKey || "");
					if (!isValid) {
						throw new Error("License key is invalid");
					}
				} catch (error) {
					await db
						.update(userSchema)
						.set({ isValidEnterpriseLicense: false })
						.where(eq(userSchema.id, user.id));
				}
			}
		}
	});
};

export const validateLicenseKey = async (licenseKey: string) => {
	try {
		const ip = await getPublicIpWithFallback();
		const result = await fetch(
			`${process.env.LICENSE_KEY_URL || "http://localhost:4002"}/licenses/validate`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ licenseKey, ip }),
			},
		);

		if (!result.ok) {
			const errorData = await result.json().catch(() => ({}));
			throw new Error(errorData.message || "Failed to validate license key");
		}

		const data = await result.json();
		return data.valid;
	} catch (error) {
		console.error(
			error instanceof Error ? error.message : "Failed to validate license key",
		);
		throw error;
	}
};

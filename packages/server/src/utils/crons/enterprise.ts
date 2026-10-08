import { and, eq, isNotNull } from "drizzle-orm";
import { scheduleJob } from "node-schedule";
import { db } from "../../db/index";
import { user as userSchema } from "../../db/schema/user";
import { validateLicenseKey } from "../enterprise";

export { LICENSE_KEY_URL, validateLicenseKey } from "../enterprise";

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

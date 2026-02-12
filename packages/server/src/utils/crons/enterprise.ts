import { getPublicIpWithFallback } from "@dokploy/server/wss/utils";
import { and, eq, isNotNull } from "drizzle-orm";
import { scheduleJob } from "node-schedule";
import { db } from "../../db/index";
import { user as userSchema } from "../../db/schema/user";

export const LICENSE_KEY_URL =
	process.env.NODE_ENV === "development"
		? "http://localhost:4002"
		: "https://licenses-api.dokploy.com";

export const initEnterpriseBackupCronJobs = async () => {
	// Enterprise license validation cron disabled - all enterprise features are free
	console.log("Enterprise license validation cron disabled - all features are freely available");
	// No cron job scheduled
};

export const validateLicenseKey = async (licenseKey: string) => {
	// Enterprise features are freely available - always return valid
	console.log("License validation bypassed - all enterprise features are free");
	return true;
};

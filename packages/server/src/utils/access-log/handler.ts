import fs from "node:fs";
import path from "node:path";
import { ACCESS_LOG_RETAINED_LINES, paths } from "@dokploy/server/constants";
import {
	getWebServerSettings,
	resolveWebServerProvider,
	updateWebServerSettings,
} from "@dokploy/server/services/web-server-settings";
import { scheduledJobs, scheduleJob } from "node-schedule";
import { quote } from "shell-quote";
import { execAsync } from "../process/execAsync";

const LOG_CLEANUP_JOB_NAME = "access-log-cleanup";

export const startLogCleanup = async (
	cronExpression = "0 0 * * *",
): Promise<boolean> => {
	try {
		const validationJob = scheduleJob(
			`${LOG_CLEANUP_JOB_NAME}-validation`,
			cronExpression,
			() => {},
		);
		if (!validationJob) {
			return false;
		}
		validationJob.cancel();

		const existingJob = scheduledJobs[LOG_CLEANUP_JOB_NAME];
		if (existingJob) {
			existingJob.cancel();
		}

		const cleanupJob = scheduleJob(
			LOG_CLEANUP_JOB_NAME,
			cronExpression,
			async () => {
				try {
					const provider = await resolveWebServerProvider();
					const currentPaths = paths();
					const accessLogPath =
						provider === "caddy"
							? currentPaths.CADDY_ACCESS_LOG_PATH
							: path.join(currentPaths.DYNAMIC_TRAEFIK_PATH, "access.log");

					if (!fs.existsSync(accessLogPath)) {
						console.error("Access log file does not exist");
						return;
					}

					const quotedAccessLogPath = quote([accessLogPath]);
					const quotedTempPath = quote([`${accessLogPath}.tmp`]);
					if (provider === "caddy") {
						await execAsync(
							`tail -n ${ACCESS_LOG_RETAINED_LINES} ${quotedAccessLogPath} > ${quotedTempPath} && cat ${quotedTempPath} > ${quotedAccessLogPath} && rm ${quotedTempPath}`,
						);
						return;
					}

					await execAsync(
						`tail -n ${ACCESS_LOG_RETAINED_LINES} ${quotedAccessLogPath} > ${quotedTempPath} && mv ${quotedTempPath} ${quotedAccessLogPath}`,
					);
					await execAsync("docker exec dokploy-traefik kill -USR1 1");
				} catch (error) {
					console.error("Error during log cleanup:", error);
				}
			},
		);
		if (!cleanupJob) {
			return false;
		}

		await updateWebServerSettings({
			logCleanupCron: cronExpression,
		});

		return true;
	} catch (error) {
		console.error("Error starting log cleanup:", error);
		return false;
	}
};

export const stopLogCleanup = async (): Promise<boolean> => {
	try {
		const existingJob = scheduledJobs[LOG_CLEANUP_JOB_NAME];
		if (existingJob) {
			existingJob.cancel();
		}

		// Update database
		await updateWebServerSettings({
			logCleanupCron: null,
		});

		return true;
	} catch (error) {
		console.error("Error stopping log cleanup:", error);
		return false;
	}
};

export const getLogCleanupStatus = async (): Promise<{
	enabled: boolean;
	cronExpression: string | null;
}> => {
	const settings = await getWebServerSettings();
	const cronExpression = settings?.logCleanupCron ?? null;
	return {
		enabled: cronExpression !== null,
		cronExpression,
	};
};

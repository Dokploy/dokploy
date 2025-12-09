import { paths } from "@dokploy/server/constants";
import { findOwner } from "@dokploy/server/services/admin";
import { updateUser } from "@dokploy/server/services/user";
import { scheduledJobs, scheduleJob } from "node-schedule";
import { execAsync } from "../process/execAsync";

const LOG_CLEANUP_JOB_NAME = "access-log-cleanup";

export const startLogCleanup = async (
	cronExpression = "0 0 * * *",
): Promise<boolean> => {
	try {
		const { DYNAMIC_TRAEFIK_PATH } = paths();

		const existingJob = scheduledJobs[LOG_CLEANUP_JOB_NAME];
		if (existingJob) {
			existingJob.cancel();
		}

		scheduleJob(LOG_CLEANUP_JOB_NAME, cronExpression, async () => {
			try {
				await execAsync(
					`tail -n 1000 ${DYNAMIC_TRAEFIK_PATH}/access.log > ${DYNAMIC_TRAEFIK_PATH}/access.log.tmp && mv ${DYNAMIC_TRAEFIK_PATH}/access.log.tmp ${DYNAMIC_TRAEFIK_PATH}/access.log`,
				);

				await execAsync("docker exec dokploy-traefik kill -USR1 1");
			} catch (error) {
				console.error("Error during log cleanup:", error);
			}
		});

		const owner = await findOwner();
		if (owner) {
			await updateUser(owner.user.id, {
				logCleanupCron: cronExpression,
			});
		}

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
		const owner = await findOwner();
		if (owner) {
			await updateUser(owner.user.id, {
				logCleanupCron: null,
			});
		}

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
	const owner = await findOwner();
	const cronExpression = owner?.user.logCleanupCron ?? null;
	return {
		enabled: cronExpression !== null,
		cronExpression,
	};
};

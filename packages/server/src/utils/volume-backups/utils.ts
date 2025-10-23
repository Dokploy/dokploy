import path from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	createDeploymentVolumeBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { findVolumeBackupById } from "@dokploy/server/services/volume-backups";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { scheduledJobs, scheduleJob } from "node-schedule";
import { getS3Credentials, normalizeS3Path } from "../backups/utils";
import { sendVolumeBackupNotifications } from "../notifications/volume-backup";
import { backupVolume } from "./backup";

export const scheduleVolumeBackup = async (volumeBackupId: string) => {
	const volumeBackup = await findVolumeBackupById(volumeBackupId);
	scheduleJob(volumeBackupId, volumeBackup.cronExpression, async () => {
		await runVolumeBackup(volumeBackupId);
	});
};

export const removeVolumeBackupJob = async (volumeBackupId: string) => {
	const currentJob = scheduledJobs[volumeBackupId];
	currentJob?.cancel();
};

const cleanupOldVolumeBackups = async (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
	serverId?: string | null,
) => {
	const { keepLatestCount, destination, prefix, volumeName } = volumeBackup;

	if (!keepLatestCount) return;

	try {
		const rcloneFlags = getS3Credentials(destination);
		const normalizedPrefix = normalizeS3Path(prefix);
		const backupFilesPath = `:s3:${destination.bucket}/${normalizedPrefix}`;
		const listCommand = `rclone lsf ${rcloneFlags.join(" ")} --include \"${volumeName}-*.tar\" :s3:${destination.bucket}/${normalizedPrefix}`;
		const sortAndPick = `sort -r | tail -n +$((${keepLatestCount}+1)) | xargs -I{}`;
		const deleteCommand = `rclone delete ${rcloneFlags.join(" ")} ${backupFilesPath}{}`;
		const fullCommand = `${listCommand} | ${sortAndPick} ${deleteCommand}`;

		if (serverId) {
			await execAsyncRemote(serverId, fullCommand);
		} else {
			await execAsync(fullCommand);
		}
	} catch (error) {
		console.error("Volume backup retention error", error);
	}
};

export const runVolumeBackup = async (volumeBackupId: string) => {
	const volumeBackup = await findVolumeBackupById(volumeBackupId);
	const serverId =
		volumeBackup.application?.serverId || volumeBackup.compose?.serverId;
	const deployment = await createDeploymentVolumeBackup({
		volumeBackupId: volumeBackup.volumeBackupId,
		title: "Volume Backup",
		description: "Volume Backup",
	});

	try {
		const command = await backupVolume(volumeBackup);

		const commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (serverId) {
			await execAsyncRemote(serverId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}

		if (volumeBackup.keepLatestCount && volumeBackup.keepLatestCount > 0) {
			await cleanupOldVolumeBackups(volumeBackup, serverId);
		}

		await updateDeploymentStatus(deployment.deploymentId, "done");

		// Send success notification
		try {
			const projectName = volumeBackup.application?.environment?.project?.name || 
								volumeBackup.compose?.environment?.project?.name || 
								volumeBackup.postgres?.environment?.project?.name ||
								volumeBackup.mysql?.environment?.project?.name ||
								volumeBackup.mariadb?.environment?.project?.name ||
								volumeBackup.mongo?.environment?.project?.name ||
								volumeBackup.redis?.environment?.project?.name ||
								"Unknown Project";
			
			const organizationId = volumeBackup.application?.environment?.project?.organizationId || 
									volumeBackup.compose?.environment?.project?.organizationId || 
									volumeBackup.postgres?.environment?.project?.organizationId ||
									volumeBackup.mysql?.environment?.project?.organizationId ||
									volumeBackup.mariadb?.environment?.project?.organizationId ||
									volumeBackup.mongo?.environment?.project?.organizationId ||
									volumeBackup.redis?.environment?.project?.organizationId ||
									"";

			// Map service type to match notification function expectations
			const mappedServiceType = volumeBackup.serviceType === "mongo" ? "mongodb" : volumeBackup.serviceType;

			await sendVolumeBackupNotifications({
				projectName,
				applicationName: volumeBackup.name,
				volumeName: volumeBackup.volumeName,
				serviceType: mappedServiceType as "application" | "postgres" | "mysql" | "mongodb" | "mariadb" | "redis" | "compose",
				type: "success",
				organizationId,
			});
		} catch (notificationError) {
			console.error("Failed to send volume backup success notification:", notificationError);
		}
	} catch (error) {
		const { VOLUME_BACKUPS_PATH } = paths(!!serverId);
		const volumeBackupPath = path.join(
			VOLUME_BACKUPS_PATH,
			volumeBackup.appName,
		);
		// delete all the .tar files
		const command = `rm -rf ${volumeBackupPath}/*.tar`;
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
		await updateDeploymentStatus(deployment.deploymentId, "error");

		// Send error notification
		try {
			const projectName = volumeBackup.application?.environment?.project?.name || 
								volumeBackup.compose?.environment?.project?.name || 
								volumeBackup.postgres?.environment?.project?.name ||
								volumeBackup.mysql?.environment?.project?.name ||
								volumeBackup.mariadb?.environment?.project?.name ||
								volumeBackup.mongo?.environment?.project?.name ||
								volumeBackup.redis?.environment?.project?.name ||
								"Unknown Project";
			
			const organizationId = volumeBackup.application?.environment?.project?.organizationId || 
									volumeBackup.compose?.environment?.project?.organizationId || 
									volumeBackup.postgres?.environment?.project?.organizationId ||
									volumeBackup.mysql?.environment?.project?.organizationId ||
									volumeBackup.mariadb?.environment?.project?.organizationId ||
									volumeBackup.mongo?.environment?.project?.organizationId ||
									volumeBackup.redis?.environment?.project?.organizationId ||
									"";

			// Map service type to match notification function expectations
			const mappedServiceType = volumeBackup.serviceType === "mongo" ? "mongodb" : volumeBackup.serviceType;

			await sendVolumeBackupNotifications({
				projectName,
				applicationName: volumeBackup.name,
				volumeName: volumeBackup.volumeName,
				serviceType: mappedServiceType as "application" | "postgres" | "mysql" | "mongodb" | "mariadb" | "redis" | "compose",
				type: "error",
				organizationId,
				errorMessage: error instanceof Error ? error.message : String(error),
			});
		} catch (notificationError) {
			console.error("Failed to send volume backup error notification:", notificationError);
		}

		console.error(error);
	}
};

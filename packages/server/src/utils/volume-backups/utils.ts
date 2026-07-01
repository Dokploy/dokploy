import path from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	createDeploymentVolumeBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { findDestinationById } from "@dokploy/server/services/destination";
import { findVolumeBackupById } from "@dokploy/server/services/volume-backups";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { quoteShellArgument } from "@dokploy/server/utils/shell";
import { scheduledJobs, scheduleJob } from "node-schedule";
import {
	assertRcloneS3DestinationAllowed,
	buildRcloneS3Command,
	buildRcloneS3DeleteXargsCommand,
	getRcloneS3Destination,
	normalizeS3Path,
	shouldRunBackupRetention,
} from "../backups/utils";
import { sendVolumeBackupNotifications } from "../notifications/volume-backup";
import {
	backupVolume,
	getVolumeServiceAppName,
	resolveVolumeBackupServerId,
} from "./backup";

// Helper functions to extract project info from volume backup
const getProjectName = (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
): string => {
	const services = [
		volumeBackup.application,
		volumeBackup.compose,
		volumeBackup.postgres,
		volumeBackup.mysql,
		volumeBackup.mariadb,
		volumeBackup.mongo,
		volumeBackup.redis,
		volumeBackup.libsql,
	];

	for (const service of services) {
		if (service?.environment?.project?.name) {
			return service.environment.project.name;
		}
	}

	return "Unknown Project";
};

const getOrganizationId = (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
): string => {
	const services = [
		volumeBackup.application,
		volumeBackup.compose,
		volumeBackup.postgres,
		volumeBackup.mysql,
		volumeBackup.mariadb,
		volumeBackup.mongo,
		volumeBackup.redis,
		volumeBackup.libsql,
	];

	for (const service of services) {
		if (service?.environment?.project?.organizationId) {
			return service.environment.project.organizationId;
		}
	}

	return "";
};

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
	const { keepLatestCount, prefix, volumeName } = volumeBackup;
	const destination = await findDestinationById(volumeBackup.destinationId);

	if (!shouldRunBackupRetention(keepLatestCount)) {
		return;
	}

	try {
		const safeDestination = await assertRcloneS3DestinationAllowed(destination);
		const s3AppName = getVolumeServiceAppName(volumeBackup);
		const backupFilesPath = getRcloneS3Destination(
			safeDestination,
			`${s3AppName}/${normalizeS3Path(prefix || "")}`,
		);
		const listCommand = buildRcloneS3Command("lsf", safeDestination, [
			"--include",
			`${volumeName}-*.tar`,
			backupFilesPath,
		]);
		const sortAndPick = `sort -r | tail -n +$((${keepLatestCount}+1)) | xargs -I{}`;
		const deleteCommand = buildRcloneS3DeleteXargsCommand(
			safeDestination,
			backupFilesPath,
		);
		const fullCommand = `${listCommand} | ${sortAndPick} sh -c ${quoteShellArgument(deleteCommand)} _ {}`;

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
	const serverId = resolveVolumeBackupServerId(volumeBackup);
	const deployment = await createDeploymentVolumeBackup({
		volumeBackupId: volumeBackup.volumeBackupId,
		title: "Volume Backup",
		description: "Volume Backup",
	});
	const projectName = getProjectName(volumeBackup);
	const organizationId = getOrganizationId(volumeBackup);
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

		// Map service type to match notification function expectations
		const mappedServiceType =
			volumeBackup.serviceType === "mongo"
				? "mongodb"
				: volumeBackup.serviceType;

		try {
			await sendVolumeBackupNotifications({
				projectName,
				applicationName: volumeBackup.name,
				volumeName: volumeBackup.volumeName,
				serviceType: mappedServiceType,
				type: "success",
				organizationId,
			});
		} catch (notificationError) {
			console.error(
				"Failed to send volume backup success notification",
				notificationError,
			);
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
		const mappedServiceType =
			volumeBackup.serviceType === "mongo"
				? "mongodb"
				: volumeBackup.serviceType;

		try {
			await sendVolumeBackupNotifications({
				projectName,
				applicationName: volumeBackup.name,
				volumeName: volumeBackup.volumeName,
				serviceType: mappedServiceType,
				type: "error",
				organizationId,
				errorMessage: error instanceof Error ? error.message : String(error),
			});
		} catch (notificationError) {
			console.error(
				"Failed to send volume backup error notification",
				notificationError,
			);
		}
	}
};

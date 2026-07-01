import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { findComposeById } from "@dokploy/server/services/compose";
import { findDestinationById } from "@dokploy/server/services/destination";
import type { findVolumeBackupById } from "@dokploy/server/services/volume-backups";
import {
	assertRcloneS3DestinationAllowed,
	buildRcloneS3Command,
	getBackupTimestamp,
	getRcloneS3Destination,
	normalizeS3Path,
} from "../backups/utils";
import { quoteShellArgs } from "../shell";
import {
	normalizeDockerVolumeName,
	normalizeVolumeBackupServiceName,
	quoteVolumeBackupShellArg,
} from "./safe-input";

export const getVolumeServiceAppName = (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
): string => {
	if (volumeBackup.compose?.appName) {
		const safeComposeAppName = normalizeVolumeBackupServiceName(
			volumeBackup.compose.appName,
		);
		return volumeBackup.serviceName
			? `${safeComposeAppName}_${normalizeVolumeBackupServiceName(volumeBackup.serviceName)}`
			: safeComposeAppName;
	}
	const serviceAppName =
		volumeBackup.application?.appName ||
		volumeBackup.postgres?.appName ||
		volumeBackup.mysql?.appName ||
		volumeBackup.mariadb?.appName ||
		volumeBackup.mongo?.appName ||
		volumeBackup.redis?.appName ||
		volumeBackup.libsql?.appName;
	return normalizeVolumeBackupServiceName(
		serviceAppName || volumeBackup.appName,
	);
};

export const resolveVolumeBackupServerId = (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
) =>
	volumeBackup.application?.serverId ||
	volumeBackup.compose?.serverId ||
	volumeBackup.postgres?.serverId ||
	volumeBackup.mysql?.serverId ||
	volumeBackup.mariadb?.serverId ||
	volumeBackup.mongo?.serverId ||
	volumeBackup.redis?.serverId ||
	volumeBackup.libsql?.serverId;

export const backupVolume = async (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
) => {
	const { serviceType, volumeName, turnOff, prefix } = volumeBackup;
	const safeVolumeName = normalizeDockerVolumeName(volumeName);
	const safeBackupAppName = normalizeVolumeBackupServiceName(
		volumeBackup.appName,
	);
	const destination = await findDestinationById(volumeBackup.destinationId);
	const serverId = resolveVolumeBackupServerId(volumeBackup);
	const { VOLUME_BACKUPS_PATH, VOLUME_BACKUP_LOCK_PATH } = paths(!!serverId);
	const s3AppName = getVolumeServiceAppName(volumeBackup);
	const backupFileName = `${safeVolumeName}-${getBackupTimestamp()}.tar`;
	const bucketDestination = `${s3AppName}/${normalizeS3Path(prefix || "")}${backupFileName}`;
	const volumeBackupPath = path.join(VOLUME_BACKUPS_PATH, safeBackupAppName);
	const backupFileInContainer = `/backup/${backupFileName}`;
	const quotedVolumeMount = quoteVolumeBackupShellArg(
		`${safeVolumeName}:/volume_data`,
	);
	const quotedBackupMount = quoteVolumeBackupShellArg(
		`${volumeBackupPath}:/backup`,
	);
	const tarBackupCommand = quoteVolumeBackupShellArg(
		`cd /volume_data && tar cvf ${quoteVolumeBackupShellArg(backupFileInContainer)} .`,
	);
	const quotedVolumeBackupPath = quoteVolumeBackupShellArg(volumeBackupPath);
	const quotedBackupFilePath = quoteVolumeBackupShellArg(
		path.join(volumeBackupPath, backupFileName),
	);

	const safeDestination = await assertRcloneS3DestinationAllowed(destination);
	const rcloneCommand = buildRcloneS3Command("copyto", safeDestination, [
		`${volumeBackupPath}/${backupFileName}`,
		getRcloneS3Destination(safeDestination, bucketDestination),
	]);

	const backupCommand = `
	set -e
	echo "Volume name: ${safeVolumeName}"
	echo "Backup file name: ${backupFileName}"
	echo "Turning off volume backup: ${turnOff ? "Yes" : "No"}"
	echo "Starting volume backup" 
	echo "Dir: ${volumeBackupPath}"
    docker run --rm \
  -v ${quotedVolumeMount} \
  -v ${quotedBackupMount} \
  ubuntu \
  bash -c ${tarBackupCommand}
  echo "Volume backup done ✅"
  `;

	const uploadCommand = `
  echo "Starting upload to S3..."
  ${rcloneCommand}
  echo "Upload to S3 done ✅"
  echo "Cleaning up local backup file..."
  rm -f -- ${quotedBackupFilePath}
  echo "Local backup file cleaned up ✅"
  `;

	if (!turnOff) {
		return `
		${backupCommand}
		${uploadCommand}
		`;
	}

	const serviceLockId =
		serviceType === "application"
			? normalizeVolumeBackupServiceName(
					volumeBackup.application?.appName || "",
				)
			: `${normalizeVolumeBackupServiceName(volumeBackup.compose?.appName || "")}_${normalizeVolumeBackupServiceName(volumeBackup.serviceName || "")}`;

	const lockPath = `${VOLUME_BACKUP_LOCK_PATH}-${serviceLockId}`;
	const quotedLockPath = quoteVolumeBackupShellArg(lockPath);

	const lockWrapper = (body: string) => `
		set -e

		LOCK_PATH=${quotedLockPath}

		echo "Waiting for volume backup lock: $LOCK_PATH"

		if command -v flock >/dev/null 2>&1; then
			exec 9>"$LOCK_PATH"
			flock 9
		else
			LOCK_DIR="$LOCK_PATH.dir"
			while ! mkdir "$LOCK_DIR" 2>/dev/null; do
				echo "Waiting for volume backup lock: $LOCK_PATH"
				sleep 5
			done
			trap 'rm -rf "$LOCK_DIR"' EXIT
		fi

		echo "Volume backup lock acquired"

		${body}

		echo "Volume backup lock released"
	`;

	console.log(
		lockWrapper(`
		echo "Volume backup lock acquired"
		echo "Volume backup lock released"
	`),
	);

	if (serviceType === "application") {
		const serviceName = normalizeVolumeBackupServiceName(
			volumeBackup.application?.appName || "",
		);
		return lockWrapper(`
		echo "Stopping application to 0 replicas"
		ACTUAL_REPLICAS=$(docker service inspect ${quoteVolumeBackupShellArg(serviceName)} --format "{{.Spec.Mode.Replicated.Replicas}}")
		echo "Actual replicas: $ACTUAL_REPLICAS"
		docker service update --replicas=0 ${quoteVolumeBackupShellArg(serviceName)}
        ${backupCommand}
		echo "Starting application to $ACTUAL_REPLICAS replicas"
        docker service update --replicas=$ACTUAL_REPLICAS --with-registry-auth ${quoteVolumeBackupShellArg(serviceName)}
		${uploadCommand}
  `);
	}
	if (serviceType === "compose") {
		const compose = await findComposeById(
			volumeBackup.compose?.composeId || "",
		);
		let stopCommand = "";
		let startCommand = "";
		const composeAppName = normalizeVolumeBackupServiceName(compose.appName);
		const composeServiceName = normalizeVolumeBackupServiceName(
			volumeBackup.serviceName || "",
		);
		const stackServiceName = `${composeAppName}_${composeServiceName}`;
		const quotedStackServiceName = quoteVolumeBackupShellArg(stackServiceName);

		if (compose.composeType === "stack") {
			stopCommand = `
			echo "Stopping compose to 0 replicas"
			echo "Service name: ${stackServiceName}"
            ACTUAL_REPLICAS=$(docker service inspect ${quotedStackServiceName} --format "{{.Spec.Mode.Replicated.Replicas}}")
            echo "Actual replicas: $ACTUAL_REPLICAS"
            docker service update --replicas=0 ${quotedStackServiceName}`;

			startCommand = `
			echo "Starting compose to $ACTUAL_REPLICAS replicas"
			docker service update --replicas=$ACTUAL_REPLICAS --with-registry-auth ${quotedStackServiceName}`;
		} else {
			const containerLookupCommand = quoteShellArgs([
				"docker",
				"ps",
				"-q",
				"--filter",
				`label=com.docker.compose.project=${composeAppName}`,
				"--filter",
				`label=com.docker.compose.service=${composeServiceName}`,
			]);
			stopCommand = `
			echo "Stopping compose container"
            ID=$(${containerLookupCommand})
            docker stop $ID`;

			startCommand = `
            echo "Starting compose container"
            docker start $ID
			echo "Compose container started"
			`;
		}
		return lockWrapper(`
        ${stopCommand}
        ${backupCommand}
        ${startCommand}
		${uploadCommand}
  `);
	}
};

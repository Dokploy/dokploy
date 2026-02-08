import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { findComposeById } from "@dokploy/server/services/compose";
import type { findVolumeBackupById } from "@dokploy/server/services/volume-backups";
import { getS3Credentials, normalizeS3Path } from "../backups/utils";

export const backupVolume = async (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
) => {
	const { serviceType, volumeName, turnOff, prefix } = volumeBackup;
	const serverId =
		volumeBackup.application?.serverId || volumeBackup.compose?.serverId;
	const { VOLUME_BACKUPS_PATH, VOLUME_BACKUP_LOCK_PATH } = paths(!!serverId);
	const destination = volumeBackup.destination;
	const backupFileName = `${volumeName}-${new Date().toISOString()}.tar`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;
	const rcloneFlags = getS3Credentials(volumeBackup.destination);
	const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;
	const volumeBackupPath = path.join(VOLUME_BACKUPS_PATH, volumeBackup.appName);

	const rcloneCommand = `rclone copyto ${rcloneFlags.join(" ")} "${volumeBackupPath}/${backupFileName}" "${rcloneDestination}"`;

	const baseCommand = `
	set -e
	echo "Volume name: ${volumeName}"
	echo "Backup file name: ${backupFileName}"
	echo "Turning off volume backup: ${turnOff ? "Yes" : "No"}"
	echo "Starting volume backup" 
	echo "Dir: ${volumeBackupPath}"
    docker run --rm \
  -v ${volumeName}:/volume_data \
  -v ${volumeBackupPath}:/backup \
  ubuntu \
  bash -c "cd /volume_data && tar cvf /backup/${backupFileName} ."
  echo "Volume backup done ✅"
  echo "Starting upload to S3..."
  ${rcloneCommand}
  echo "Upload to S3 done ✅"
  echo "Cleaning up local backup file..."
  rm "${volumeBackupPath}/${backupFileName}"
  echo "Local backup file cleaned up ✅"
  `;

	if (!turnOff) {
		return baseCommand;
	}

	const serviceLockId =
		serviceType === "application"
			? volumeBackup.application?.appName
			: `${volumeBackup.compose?.appName}_${volumeBackup.serviceName}`;

	const lockPath = `${VOLUME_BACKUP_LOCK_PATH}-${serviceLockId}`;

	const lockWrapper = (body: string) => `
		set -e

		LOCK_PATH="${lockPath}"

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
		return lockWrapper(`
		echo "Stopping application to 0 replicas"
		ACTUAL_REPLICAS=$(docker service inspect ${volumeBackup.application?.appName} --format "{{.Spec.Mode.Replicated.Replicas}}")
		echo "Actual replicas: $ACTUAL_REPLICAS"
		docker service update --replicas=0 ${volumeBackup.application?.appName}
        ${baseCommand}
		echo "Starting application to $ACTUAL_REPLICAS replicas"
        docker service update --replicas=$ACTUAL_REPLICAS --with-registry-auth ${volumeBackup.application?.appName}
  `);
	}
	if (serviceType === "compose") {
		const compose = await findComposeById(
			volumeBackup.compose?.composeId || "",
		);
		let stopCommand = "";
		let startCommand = "";

		if (compose.composeType === "stack") {
			stopCommand = `
			echo "Stopping compose to 0 replicas"
			echo "Service name: ${compose.appName}_${volumeBackup.serviceName}"
            ACTUAL_REPLICAS=$(docker service inspect ${compose.appName}_${volumeBackup.serviceName} --format "{{.Spec.Mode.Replicated.Replicas}}")
            echo "Actual replicas: $ACTUAL_REPLICAS"
            docker service update --replicas=0 ${compose.appName}_${volumeBackup.serviceName}`;

			startCommand = `
			echo "Starting compose to $ACTUAL_REPLICAS replicas"
			docker service update --replicas=$ACTUAL_REPLICAS --with-registry-auth ${compose.appName}_${volumeBackup.serviceName}`;
		} else {
			stopCommand = `
			echo "Stopping compose container"
            ID=$(docker ps -q --filter "label=com.docker.compose.project=${compose.appName}" --filter "label=com.docker.compose.service=${volumeBackup.serviceName}")
            docker stop $ID`;

			startCommand = `
            echo "Starting compose container"
            docker start $ID
			echo "Compose container started"
			`;
		}
		return lockWrapper(`
        ${stopCommand}
        ${baseCommand}
        ${startCommand}
  `);
	}
};

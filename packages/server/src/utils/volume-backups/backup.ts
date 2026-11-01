import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { findComposeById } from "@dokploy/server/services/compose";
import { findDestinationById } from "@dokploy/server/services/destination";
import type { findVolumeBackupById } from "@dokploy/server/services/volume-backups";
import {
	getBackupTimestamp,
	getS3Credentials,
	normalizeS3Path,
} from "../backups/utils";

interface RestartSafeBackupCommandOptions {
	stopCommand: string;
	backupCommand: string;
	startCommand: string;
	uploadCommand: string;
}

export const createRestartSafeBackupCommand = ({
	stopCommand,
	backupCommand,
	startCommand,
	uploadCommand,
}: RestartSafeBackupCommandOptions) => `
	${stopCommand}
	set +e
	(
		${backupCommand}
	)
	DOKPLOY_VOLUME_BACKUP_STATUS=$?
	(
		set -e
		${startCommand}
	)
	DOKPLOY_VOLUME_RESTART_STATUS=$?
	set -e
	if [ "$DOKPLOY_VOLUME_BACKUP_STATUS" -ne 0 ]; then
		if [ "$DOKPLOY_VOLUME_RESTART_STATUS" -ne 0 ]; then
			echo "Service restart also failed with exit code $DOKPLOY_VOLUME_RESTART_STATUS"
		fi
		exit "$DOKPLOY_VOLUME_BACKUP_STATUS"
	fi
	if [ "$DOKPLOY_VOLUME_RESTART_STATUS" -ne 0 ]; then
		exit "$DOKPLOY_VOLUME_RESTART_STATUS"
	fi
	${uploadCommand}
`;

export const getVolumeServiceAppName = (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
): string => {
	if (volumeBackup.compose?.appName) {
		return volumeBackup.serviceName
			? `${volumeBackup.compose.appName}_${volumeBackup.serviceName}`
			: volumeBackup.compose.appName;
	}
	const serviceAppName =
		volumeBackup.application?.appName ||
		volumeBackup.postgres?.appName ||
		volumeBackup.mysql?.appName ||
		volumeBackup.mariadb?.appName ||
		volumeBackup.mongo?.appName ||
		volumeBackup.redis?.appName ||
		volumeBackup.libsql?.appName;
	return serviceAppName || volumeBackup.appName;
};

export const backupVolume = async (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
) => {
	const { serviceType, volumeName, turnOff, prefix } = volumeBackup;
	const destination = await findDestinationById(volumeBackup.destinationId);
	const serverId =
		volumeBackup.application?.serverId || volumeBackup.compose?.serverId;
	const { VOLUME_BACKUPS_PATH, VOLUME_BACKUP_LOCK_PATH } = paths(!!serverId);
	const s3AppName = getVolumeServiceAppName(volumeBackup);
	const backupFileName = `${volumeName}-${getBackupTimestamp()}.tar`;
	const bucketDestination = `${s3AppName}/${normalizeS3Path(prefix || "")}${backupFileName}`;
	const rcloneFlags = getS3Credentials(destination);
	const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;
	const volumeBackupPath = path.join(VOLUME_BACKUPS_PATH, volumeBackup.appName);

	const rcloneCommand = `rclone copyto ${rcloneFlags.join(" ")} "${volumeBackupPath}/${backupFileName}" "${rcloneDestination}"`;

	// GNU tar exits 1 when a file changes while being read, which is expected on a live volume
	const backupCommand = `
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
  bash -c "cd /volume_data && tar cvf /backup/${backupFileName} . || [ \\$? -eq 1 ]"
  echo "Volume backup done ✅"
  `;

	const uploadCommand = `
  echo "Starting upload to S3..."
  ${rcloneCommand}
  echo "Upload to S3 done ✅"
  echo "Cleaning up local backup file..."
  rm "${volumeBackupPath}/${backupFileName}"
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
		return lockWrapper(
			createRestartSafeBackupCommand({
				stopCommand: `
				echo "Stopping application to 0 replicas"
				ACTUAL_REPLICAS=$(docker service inspect ${volumeBackup.application?.appName} --format "{{.Spec.Mode.Replicated.Replicas}}")
				echo "Actual replicas: $ACTUAL_REPLICAS"
				docker service update --replicas=0 ${volumeBackup.application?.appName}`,
				backupCommand,
				startCommand: `
				echo "Starting application to $ACTUAL_REPLICAS replicas"
				docker service update --replicas=$ACTUAL_REPLICAS --with-registry-auth ${volumeBackup.application?.appName}`,
				uploadCommand,
			}),
		);
	}
	if (serviceType === "compose") {
		const compose = await findComposeById(
			volumeBackup.compose?.composeId || "",
		);
		let stopCommand = "";
		let startCommand = "";
		// Finding nothing to stop can also mean a renamed service or a removed
		// volume. Copying a volume still in use would break the turn off guarantee,
		// and docker run would create a missing volume, whose empty archive lets
		// retention rotate out the real backups.
		const requireIdleVolumeCommand = `
				docker volume inspect ${volumeName} > /dev/null
				VOLUME_CONTAINERS=$(docker ps -q --filter "volume=${volumeName}")
				if [ -n "$VOLUME_CONTAINERS" ]; then
					echo "Volume ${volumeName} is still used by running containers, check the service name of this backup"
					exit 1
				fi`;

		if (compose.composeType === "stack") {
			const stackServiceName = `${compose.appName}_${volumeBackup.serviceName}`;

			// Stopping a stack removes its services, and the name filter also matches
			// by prefix, so the exact name has to be looked up in the result.
			stopCommand = `
			ACTUAL_REPLICAS=""
			SERVICE_NAMES=$(docker service ls --filter "name=${stackServiceName}" --format "{{.Name}}")
			if echo "$SERVICE_NAMES" | grep -qxF "${stackServiceName}"; then
				echo "Stopping compose to 0 replicas"
				echo "Service name: ${stackServiceName}"
				ACTUAL_REPLICAS=$(docker service inspect ${stackServiceName} --format "{{.Spec.Mode.Replicated.Replicas}}")
				echo "Actual replicas: $ACTUAL_REPLICAS"
				docker service update --replicas=0 ${stackServiceName}
			else
				echo "Service ${stackServiceName} is not deployed, nothing to stop"
				${requireIdleVolumeCommand}
			fi`;

			startCommand = `
			if [ -n "$ACTUAL_REPLICAS" ]; then
				echo "Starting compose to $ACTUAL_REPLICAS replicas"
				docker service update --replicas=$ACTUAL_REPLICAS --with-registry-auth ${stackServiceName}
			fi`;
		} else {
			stopCommand = `
			ID=$(docker ps -q --filter "label=com.docker.compose.project=${compose.appName}" --filter "label=com.docker.compose.service=${volumeBackup.serviceName}")
			if [ -n "$ID" ]; then
				echo "Stopping compose container"
				docker stop $ID
			else
				echo "No running compose container, nothing to stop"
				${requireIdleVolumeCommand}
			fi`;

			startCommand = `
			if [ -n "$ID" ]; then
				echo "Starting compose container"
				docker start $ID
				echo "Compose container started"
			fi`;
		}
		return lockWrapper(
			createRestartSafeBackupCommand({
				stopCommand,
				backupCommand,
				startCommand,
				uploadCommand,
			}),
		);
	}
};

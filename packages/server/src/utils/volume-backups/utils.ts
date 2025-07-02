import { findVolumeBackupById } from "@dokploy/server/services/volume-backups";
import {
	createDeploymentVolumeBackup,
	execAsync,
	execAsyncRemote,
	findApplicationById,
	findComposeById,
	findDestinationById,
	getS3Credentials,
	normalizeS3Path,
	paths,
	updateDeploymentStatus,
} from "../..";
import path from "node:path";

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

		await updateDeploymentStatus(deployment.deploymentId, "done");
	} catch (error) {
		await updateDeploymentStatus(deployment.deploymentId, "error");
		console.error(error);
	}
};

const backupVolume = async (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
) => {
	const { serviceType, volumeName, turnOff, prefix } = volumeBackup;
	const serverId =
		volumeBackup.application?.serverId || volumeBackup.compose?.serverId;
	const { VOLUME_BACKUPS_PATH } = paths(!!serverId);
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
  `;

	if (!turnOff) {
		return baseCommand;
	}

	if (serviceType === "application") {
		return `
		echo "Stopping application to 0 replicas"
		ACTUAL_REPLICAS=$(docker service inspect ${volumeBackup.application?.appName} --format "{{.Spec.Mode.Replicated.Replicas}}")
		echo "Actual replicas: $ACTUAL_REPLICAS"
		docker service scale ${volumeBackup.application?.appName}=0
        ${baseCommand}
		echo "Starting application to $ACTUAL_REPLICAS replicas"
        docker service scale ${volumeBackup.application?.appName}=$ACTUAL_REPLICAS
  `;
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
            docker service scale ${compose.appName}_${volumeBackup.serviceName}=0`;
			startCommand = `
			echo "Starting compose to $ACTUAL_REPLICAS replicas"
			docker service scale ${compose.appName}_${volumeBackup.serviceName}=$ACTUAL_REPLICAS`;
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
		return `
        ${stopCommand}
        ${baseCommand}
        ${startCommand}
  `;
	}
};

export const restoreVolume = async (
	id: string,
	destinationId: string,
	volumeName: string,
	backupFileName: string,
	serverId: string,
	serviceType: "application" | "compose",
) => {
	const destination = await findDestinationById(destinationId);
	const { VOLUME_BACKUPS_PATH } = paths(!!serverId);
	const volumeBackupPath = path.join(VOLUME_BACKUPS_PATH, volumeName);
	const rcloneFlags = getS3Credentials(destination);
	const bucketPath = `:s3:${destination.bucket}`;
	const backupPath = `${bucketPath}/${backupFileName}`;

	// Command to download backup file from S3
	const downloadCommand = `rclone copyto ${rcloneFlags.join(" ")} "${backupPath}" "${volumeBackupPath}/${backupFileName}"`;

	// Base restore command that creates the volume and restores data
	const baseRestoreCommand = `
	set -e
	echo "Volume name: ${volumeName}"
	echo "Backup file name: ${backupFileName}"
	echo "Volume backup path: ${volumeBackupPath}"
	echo "Downloading backup from S3..."
	mkdir -p ${volumeBackupPath}
	${downloadCommand}
	echo "Download completed ✅"
	echo "Creating new volume and restoring data..."
	docker run --rm \
		-v ${volumeName}:/volume_data \
		-v ${volumeBackupPath}:/backup \
		ubuntu \
		bash -c "cd /volume_data && tar xvf /backup/${backupFileName} ."
	echo "Volume restore completed ✅"
	`;

	// Function to check if volume exists and get containers using it
	const checkVolumeCommand = `
	# Check if volume exists
	VOLUME_EXISTS=$(docker volume ls -q --filter name="^${volumeName}$" | wc -l)
	echo "Volume exists: $VOLUME_EXISTS"
	
	if [ "$VOLUME_EXISTS" = "0" ]; then
		echo "Volume doesn't exist, proceeding with direct restore"
		${baseRestoreCommand}
	else
		echo "Volume exists, checking for containers using it (including stopped ones)..."
		
		# Get ALL containers (running and stopped) using this volume - much simpler with native filter!
		CONTAINERS_USING_VOLUME=$(docker ps -a --filter "volume=${volumeName}" --format "{{.ID}}|{{.Names}}|{{.State}}|{{.Labels}}")
		
		if [ -z "$CONTAINERS_USING_VOLUME" ]; then
			echo "Volume exists but no containers are using it"
			echo "Removing existing volume and proceeding with restore"
			docker volume rm ${volumeName} --force
			${baseRestoreCommand}
		else
			echo ""
			echo "⚠️  WARNING: Cannot restore volume as it is currently in use!"
			echo ""
			echo "📋 The following containers are using volume '${volumeName}':"
			echo ""
			
			echo "$CONTAINERS_USING_VOLUME" | while IFS='|' read container_id container_name container_state labels; do
				echo "   🐳 Container: $container_name ($container_id)"
				echo "      Status: $container_state"
				
				# Determine container type
				if echo "$labels" | grep -q "com.docker.swarm.service.name="; then
					SERVICE_NAME=$(echo "$labels" | grep -o "com.docker.swarm.service.name=[^,]*" | cut -d'=' -f2)
					echo "      Type: Docker Swarm Service ($SERVICE_NAME)"
				elif echo "$labels" | grep -q "com.docker.compose.project="; then
					PROJECT_NAME=$(echo "$labels" | grep -o "com.docker.compose.project=[^,]*" | cut -d'=' -f2)
					echo "      Type: Docker Compose ($PROJECT_NAME)"
				else
					echo "      Type: Regular Container"
				fi
				echo ""
			done
			
			echo ""
			echo "🔧 To restore this volume, please:"
			echo "   1. Stop all containers/services using this volume"
			echo "   2. Remove the existing volume: docker volume rm ${volumeName}"
			echo "   3. Run the restore operation again"
			echo ""
			echo "❌ Volume restore aborted - volume is in use"
			
			exit 1
		fi
	fi
	`;

	if (serviceType === "application") {
		const application = await findApplicationById(id);
		return `
		echo "=== VOLUME RESTORE FOR APPLICATION ==="
		echo "Application: ${application.appName}"
		${checkVolumeCommand}
		`;
	}

	if (serviceType === "compose") {
		const compose = await findComposeById(id);

		return `
		echo "=== VOLUME RESTORE FOR COMPOSE ==="
		echo "Compose: ${compose.appName}"
		echo "Compose Type: ${compose.composeType}"
		${checkVolumeCommand}
		`;
	}

	// Fallback for unknown service types
	return checkVolumeCommand;
};

import path from "node:path";
import { quote } from "shell-quote";
import {
	findApplicationById,
	findComposeById,
	findDestinationById,
	getS3Credentials,
	paths,
} from "../..";

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
	const downloadCommand = `rclone copyto ${rcloneFlags.join(" ")} ${quote([backupPath])} ${quote([`${volumeBackupPath}/${backupFileName}`])}`;

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
		bash -c "cd /volume_data && tar xvf /backup/${quote([backupFileName])} ."
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
			# Only "exited", "created" and "dead" are safe to remove. Anything else
			# (running, restarting, paused, removing) is treated as still in use.
			RUNNING_CONTAINERS=$(echo "$CONTAINERS_USING_VOLUME" | awk -F'|' '$3 != "exited" && $3 != "created" && $3 != "dead"')
			STOPPED_CONTAINERS=$(echo "$CONTAINERS_USING_VOLUME" | awk -F'|' '$3 == "exited" || $3 == "created" || $3 == "dead"')

			if [ -n "$RUNNING_CONTAINERS" ]; then
				echo ""
				echo "⚠️  WARNING: Cannot restore volume as it is currently in use!"
				echo ""
				echo "📋 The following containers are using volume '${volumeName}':"
				echo ""

				echo "$RUNNING_CONTAINERS" | while IFS='|' read container_id container_name container_state labels; do
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

			# Re-check each container's live state right before removing it: it may have
			# started running again since the "docker ps -a" snapshot above.
			ACTIVE_AGAIN=""
			while IFS='|' read -r container_id container_name container_state labels; do
				CURRENT_STATE=$(docker inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null || echo "gone")
				case "$CURRENT_STATE" in
					running|restarting|paused|removing)
						ACTIVE_AGAIN="$ACTIVE_AGAIN $container_name"
						;;
				esac
			done < <(printf '%s\\n' "$STOPPED_CONTAINERS")

			if [ -n "$ACTIVE_AGAIN" ]; then
				echo ""
				echo "⚠️  WARNING: Container(s)$ACTIVE_AGAIN became active again, aborting restore"
				echo "❌ Volume restore aborted - volume is in use"
				exit 1
			fi

			echo "Volume exists but is only referenced by stopped containers, removing them..."
			echo ""

			REMOVE_FAILED=""
			while IFS='|' read -r container_id container_name container_state labels; do
				echo "   🗑  Removing stopped container: $container_name ($container_id) [status: $container_state]"
				if ! docker rm -f "$container_id" >/dev/null 2>&1; then
					REMOVE_FAILED="$REMOVE_FAILED $container_name"
				fi
			done < <(printf '%s\\n' "$STOPPED_CONTAINERS")

			if [ -n "$REMOVE_FAILED" ]; then
				echo ""
				echo "❌ Failed to remove container(s):$REMOVE_FAILED"
				echo "❌ Volume restore aborted - could not free the volume"
				exit 1
			fi

			echo ""
			echo "Removing existing volume and proceeding with restore"
			if ! docker volume rm ${volumeName} --force; then
				echo "❌ Volume restore aborted - failed to remove existing volume"
				exit 1
			fi
			${baseRestoreCommand}
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

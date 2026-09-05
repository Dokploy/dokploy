import path from "node:path";
import { quote } from "shell-quote";
import {
	findApplicationById,
	findComposeById,
	findDestinationById,
	getRclonePathAndFlags,
	paths,
} from "../..";

const UNSAFE_BACKUP_PATH_CHARS = /[\0\r\n;&|`$<>]/;

export const normalizeVolumeBackupFilePath = (value: string) => {
	const normalized = value.trim().replace(/\\/g, "/");
	if (
		!normalized ||
		normalized.startsWith("/") ||
		normalized.endsWith("/") ||
		UNSAFE_BACKUP_PATH_CHARS.test(normalized)
	) {
		throw new Error("Invalid volume backup file path");
	}
	const segments = normalized.split("/");
	if (
		segments.some((segment) => !segment || segment === "." || segment === "..")
	) {
		throw new Error("Invalid volume backup file path");
	}
	return segments.join("/");
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
	const safeBackupFileName = normalizeVolumeBackupFilePath(backupFileName);
	const { flags: rcloneFlags, path: backupPath } = await getRclonePathAndFlags(
		destination,
		safeBackupFileName,
	);
	const localBackupPath = path.join(
		volumeBackupPath,
		...safeBackupFileName.split("/"),
	);
	const localBackupDirectory = path.dirname(localBackupPath);

	// Command to download backup file from the configured destination
	const downloadCommand = `rclone copyto ${rcloneFlags.join(" ")} ${quote([backupPath])} ${quote([localBackupPath])}`;

	// Base restore command that creates the volume and restores data
	const baseRestoreCommand = `
	set -e
	echo "Volume name: ${volumeName}"
	echo "Backup file name:" ${quote([safeBackupFileName])}
	echo "Volume backup path: ${volumeBackupPath}"
	echo "Downloading backup from destination..."
	mkdir -p ${quote([localBackupDirectory])}
	${downloadCommand}
	echo "Download completed ✅"
	echo "Creating new volume and restoring data..."
	docker run --rm \
		-v ${volumeName}:/volume_data \
		-v ${quote([volumeBackupPath])}:/backup \
		ubuntu \
		bash -c 'cd /volume_data && tar xvf "/backup/$1" .' -- ${quote([safeBackupFileName])}
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

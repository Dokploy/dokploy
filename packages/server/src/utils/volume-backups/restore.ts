import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { findApplicationById } from "@dokploy/server/services/application";
import { findComposeById } from "@dokploy/server/services/compose";
import { findDestinationById } from "@dokploy/server/services/destination";
import {
	assertRcloneS3DestinationAllowed,
	buildRcloneS3Command,
	getRcloneS3Destination,
} from "@dokploy/server/utils/backups/utils";
import {
	normalizeRelativeFilePath,
	quoteShellArg,
} from "@dokploy/server/utils/filesystem/safe-path";
import { normalizeDockerVolumeName } from "./safe-input";

const normalizeBackupObjectPath = (backupFileName: string) => {
	const backupObjectPath = normalizeRelativeFilePath(backupFileName);

	if (!backupObjectPath.endsWith(".tar")) {
		throw new Error("Invalid backup file path");
	}

	return backupObjectPath;
};

export const buildTarArchivePolicyCommand = (localBackupPath: string) => {
	const quotedLocalBackupPath = quoteShellArg(localBackupPath);
	return `
		echo "Validating backup archive..."
		tar -tf ${quotedLocalBackupPath} | awk '
			BEGIN { valid = 1 }
			{
				entry = $0
				if (entry == "" || entry ~ /^\\// || entry ~ /(^|\\/)\\.\\.(\\/|$)/ || entry ~ /\\\\/) {
					print "Unsafe archive member: " entry > "/dev/stderr"
					valid = 0
				}
			}
			END { exit valid ? 0 : 1 }
		'
		tar -tvf ${quotedLocalBackupPath} | awk '
			{
				mode = substr($1, 1, 1)
				if (mode != "-" && mode != "d") {
					print "Unsupported archive member: " $0 > "/dev/stderr"
					exit 1
				}
			}
		'
		echo "Backup archive validation completed ✅"
	`;
};

export const restoreVolume = async (
	id: string,
	destinationId: string,
	volumeName: string,
	backupFileName: string,
	serverId: string,
	serviceType: "application" | "compose",
) => {
	const safeVolumeName = normalizeDockerVolumeName(volumeName);
	const backupObjectPath = normalizeBackupObjectPath(backupFileName);
	const localBackupFileName = path.posix.basename(backupObjectPath);
	const destination = await findDestinationById(destinationId);
	const { VOLUME_BACKUPS_PATH } = paths(!!serverId);
	const volumeBackupPath = path.join(VOLUME_BACKUPS_PATH, safeVolumeName);
	const safeDestination = await assertRcloneS3DestinationAllowed(destination);
	const backupPath = getRcloneS3Destination(safeDestination, backupObjectPath);
	const localBackupPath = path.join(volumeBackupPath, localBackupFileName);
	const backupFileInContainer = `/backup/${localBackupFileName}`;
	const quotedVolumeName = quoteShellArg(safeVolumeName);
	const quotedVolumeBackupPath = quoteShellArg(volumeBackupPath);
	const quotedLocalBackupPath = quoteShellArg(localBackupPath);
	const quotedVolumeMount = quoteShellArg(`${safeVolumeName}:/volume_data`);
	const quotedBackupMount = quoteShellArg(`${volumeBackupPath}:/backup`);
	const quotedBackupFileInContainer = quoteShellArg(backupFileInContainer);

	// Command to download backup file from S3
	const downloadCommand = buildRcloneS3Command("copyto", safeDestination, [
		backupPath,
		localBackupPath,
	]);

	// Base restore command that creates the volume and restores data
	const baseRestoreCommand = `
	set -e
	echo "Volume name: ${safeVolumeName}"
	echo "Backup file name: ${backupObjectPath}"
	echo "Volume backup path: ${volumeBackupPath}"
		echo "Downloading backup from S3..."
		mkdir -p ${quotedVolumeBackupPath}
		${downloadCommand}
		echo "Download completed ✅"
		${buildTarArchivePolicyCommand(localBackupPath)}
		echo "Creating new volume and restoring data..."
		docker run --rm \
		-v ${quotedVolumeMount} \
		-v ${quotedBackupMount} \
		ubuntu \
		bash -c "cd /volume_data && tar xvf ${quotedBackupFileInContainer} ."
	echo "Volume restore completed ✅"
	`;

	// Function to check if volume exists and get containers using it
	const checkVolumeCommand = `
	# Check if volume exists
	VOLUME_EXISTS=$(docker volume ls -q --filter ${quoteShellArg(`name=^${safeVolumeName}$`)} | wc -l)
	echo "Volume exists: $VOLUME_EXISTS"
	
	if [ "$VOLUME_EXISTS" = "0" ]; then
		echo "Volume doesn't exist, proceeding with direct restore"
		${baseRestoreCommand}
	else
		echo "Volume exists, checking for containers using it (including stopped ones)..."
		
		# Get ALL containers (running and stopped) using this volume - much simpler with native filter!
		CONTAINERS_USING_VOLUME=$(docker ps -a --filter ${quoteShellArg(`volume=${safeVolumeName}`)} --format "{{.ID}}|{{.Names}}|{{.State}}|{{.Labels}}")
		
		if [ -z "$CONTAINERS_USING_VOLUME" ]; then
			echo "Volume exists but no containers are using it"
			echo "Removing existing volume and proceeding with restore"
			docker volume rm ${quotedVolumeName} --force
			${baseRestoreCommand}
		else
			echo ""
			echo "⚠️  WARNING: Cannot restore volume as it is currently in use!"
			echo ""
			echo "📋 The following containers are using volume '${safeVolumeName}':"
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
			echo "   2. Remove the existing volume: docker volume rm ${safeVolumeName}"
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
		echo ${quoteShellArg(`Application: ${application.appName}`)}
		${checkVolumeCommand}
		`;
	}

	if (serviceType === "compose") {
		const compose = await findComposeById(id);

		return `
		echo "=== VOLUME RESTORE FOR COMPOSE ==="
		echo ${quoteShellArg(`Compose: ${compose.appName}`)}
		echo ${quoteShellArg(`Compose Type: ${compose.composeType}`)}
		${checkVolumeCommand}
		`;
	}

	// Fallback for unknown service types
	return checkVolumeCommand;
};

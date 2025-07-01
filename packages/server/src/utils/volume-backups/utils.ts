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
            docker start $ID`;
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
			echo "Found containers using the volume:"
			echo "$CONTAINERS_USING_VOLUME"
			
			# Collect unique services and containers to stop
			echo "=== PHASE 1: Stopping all containers/services using the volume ==="
			
			SERVICES_TO_RESTORE=""
			CONTAINERS_TO_RESTORE=""
			
			echo "$CONTAINERS_USING_VOLUME" | while IFS='|' read container_id container_name container_state labels; do
				echo "Analyzing container: $container_id ($container_name) - State: $container_state"
				
				# Check if it's a swarm service
				if echo "$labels" | grep -q "com.docker.swarm.service.name="; then
					SERVICE_NAME=$(echo "$labels" | grep -o "com.docker.swarm.service.name=[^,]*" | cut -d'=' -f2)
					
					# Check if we already processed this service
					if ! echo "$SERVICES_TO_RESTORE" | grep -q "SWARM:$SERVICE_NAME"; then
						echo "SWARM:$SERVICE_NAME" >> /tmp/dokploy_services_to_stop
						echo "Will stop swarm service: $SERVICE_NAME"
					fi
					
				# Check if it's a compose container
				elif echo "$labels" | grep -q "com.docker.compose.project="; then
					PROJECT_NAME=$(echo "$labels" | grep -o "com.docker.compose.project=[^,]*" | cut -d'=' -f2)
					SERVICE_NAME_COMPOSE=$(echo "$labels" | grep -o "com.docker.compose.service=[^,]*" | cut -d'=' -f2 || echo "")
					
					# Check if it's a compose stack (swarm mode) or regular compose
					if echo "$labels" | grep -q "com.docker.stack.namespace="; then
						STACK_SERVICE_NAME="$PROJECT_NAME"_"$SERVICE_NAME_COMPOSE"
						
						# Check if we already processed this stack service
						if ! echo "$SERVICES_TO_RESTORE" | grep -q "STACK:$STACK_SERVICE_NAME"; then
							echo "STACK:$STACK_SERVICE_NAME" >> /tmp/dokploy_services_to_stop
							echo "Will stop compose stack service: $STACK_SERVICE_NAME"
						fi
					else
						echo "COMPOSE:$container_id|$container_name|$container_state" >> /tmp/dokploy_services_to_stop
						echo "Will stop compose container: $container_id ($container_name)"
					fi
				else
					echo "REGULAR:$container_id|$container_name|$container_state" >> /tmp/dokploy_services_to_stop
					echo "Will stop regular container: $container_id ($container_name)"
				fi
			done
			
			# Now stop all services and containers
			if [ -f /tmp/dokploy_services_to_stop ]; then
				echo ""
				echo "=== STOPPING ALL SERVICES/CONTAINERS ==="
				
				while read line; do
					TYPE=$(echo "$line" | cut -d':' -f1)
					DATA=$(echo "$line" | cut -d':' -f2-)
					
					if [ "$TYPE" = "SWARM" ]; then
						SERVICE_NAME="$DATA"
						echo "Stopping swarm service: $SERVICE_NAME"
						
						# Get current replicas and store for later
						ACTUAL_REPLICAS=$(docker service inspect "$SERVICE_NAME" --format "{{.Spec.Mode.Replicated.Replicas}}" 2>/dev/null || echo "0")
						echo "SWARM:$SERVICE_NAME:$ACTUAL_REPLICAS" >> /tmp/dokploy_services_to_restore
						
						# Scale down to 0 if not already
						if [ "$ACTUAL_REPLICAS" != "0" ]; then
							echo "Scaling service $SERVICE_NAME to 0 replicas (was $ACTUAL_REPLICAS)"
							docker service scale "$SERVICE_NAME=0"
						else
							echo "Service $SERVICE_NAME is already scaled to 0"
						fi
						
					elif [ "$TYPE" = "STACK" ]; then
						STACK_SERVICE_NAME="$DATA"
						echo "Stopping compose stack service: $STACK_SERVICE_NAME"
						
						# Get current replicas and store for later
						ACTUAL_REPLICAS=$(docker service inspect "$STACK_SERVICE_NAME" --format "{{.Spec.Mode.Replicated.Replicas}}" 2>/dev/null || echo "0")
						echo "STACK:$STACK_SERVICE_NAME:$ACTUAL_REPLICAS" >> /tmp/dokploy_services_to_restore
						
						# Scale down to 0 if not already
						if [ "$ACTUAL_REPLICAS" != "0" ]; then
							echo "Scaling stack service $STACK_SERVICE_NAME to 0 replicas (was $ACTUAL_REPLICAS)"
							docker service scale "$STACK_SERVICE_NAME=0"
						else
							echo "Stack service $STACK_SERVICE_NAME is already scaled to 0"
						fi
						
					elif [ "$TYPE" = "COMPOSE" ]; then
						container_id=$(echo "$DATA" | cut -d'|' -f1)
						container_name=$(echo "$DATA" | cut -d'|' -f2)
						container_state=$(echo "$DATA" | cut -d'|' -f3)
						
						echo "COMPOSE:$container_id|$container_name|$container_state" >> /tmp/dokploy_services_to_restore
						
						# Stop the container if running
						if [ "$container_state" = "running" ]; then
							echo "Stopping compose container: $container_id ($container_name)"
							docker stop "$container_id"
						else
							echo "Compose container $container_id is already stopped"
						fi
						
					elif [ "$TYPE" = "REGULAR" ]; then
						container_id=$(echo "$DATA" | cut -d'|' -f1)
						container_name=$(echo "$DATA" | cut -d'|' -f2)
						container_state=$(echo "$DATA" | cut -d'|' -f3)
						
						echo "REGULAR:$container_id|$container_name|$container_state" >> /tmp/dokploy_services_to_restore
						
						# Stop the container if running
						if [ "$container_state" = "running" ]; then
							echo "Stopping regular container: $container_id ($container_name)"
							docker stop "$container_id"
						else
							echo "Regular container $container_id is already stopped"
						fi
					fi
				done < /tmp/dokploy_services_to_stop
				
				# Wait for all services to scale down
				echo ""
				echo "=== WAITING FOR ALL SERVICES TO STOP ==="
				echo "Waiting for all containers to be fully removed..."
				sleep 10
				
				# Verify all swarm services are scaled down
				if grep -q "SWARM:" /tmp/dokploy_services_to_restore 2>/dev/null; then
					echo "Verifying swarm services are scaled down..."
					grep "SWARM:" /tmp/dokploy_services_to_restore | while read line; do
						SERVICE_NAME=$(echo "$line" | cut -d':' -f2)
						while [ $(docker service ps "$SERVICE_NAME" --filter "desired-state=running" -q 2>/dev/null | wc -l) -gt 0 ]; do
							echo "Still waiting for swarm service $SERVICE_NAME to scale down..."
							sleep 3
						done
						echo "Swarm service $SERVICE_NAME is fully scaled down"
					done
				fi
				
				# Verify all stack services are scaled down
				if grep -q "STACK:" /tmp/dokploy_services_to_restore 2>/dev/null; then
					echo "Verifying stack services are scaled down..."
					grep "STACK:" /tmp/dokploy_services_to_restore | while read line; do
						STACK_SERVICE_NAME=$(echo "$line" | cut -d':' -f2)
						while [ $(docker service ps "$STACK_SERVICE_NAME" --filter "desired-state=running" -q 2>/dev/null | wc -l) -gt 0 ]; do
							echo "Still waiting for stack service $STACK_SERVICE_NAME to scale down..."
							sleep 3
						done
						echo "Stack service $STACK_SERVICE_NAME is fully scaled down"
					done
				fi
				
				echo ""
				echo "=== REMOVING STOPPED SWARM CONTAINERS USING THE VOLUME ==="
				
				# Only remove stopped containers that belong to Swarm services
				# Regular containers and compose containers should NOT be removed since they can't be recreated automatically
				SWARM_STOPPED_CONTAINERS=$(docker ps -a --filter "status=exited" --format "{{.ID}} {{.Names}} {{.Labels}}" | while read line; do
					container_id=$(echo "$line" | awk '{print $1}')
					container_name=$(echo "$line" | awk '{print $2}')
					labels=$(echo "$line" | cut -d' ' -f3-)
					
					# Check if this container uses the volume
					volume_used=$(docker inspect "$container_id" --format '{{range .Mounts}}{{.Name}} {{end}}' 2>/dev/null | grep -w "${volumeName}" || true)
					
					# Only include if it uses the volume AND belongs to a Swarm service
					if [ -n "$volume_used" ] && echo "$labels" | grep -q "com.docker.swarm.service.name="; then
						echo "$container_id"
					fi
				done)
				
				if [ -n "$SWARM_STOPPED_CONTAINERS" ]; then
					echo "Found stopped Swarm containers using the volume that need to be removed:"
					echo "$SWARM_STOPPED_CONTAINERS"
					
					echo "$SWARM_STOPPED_CONTAINERS" | while read container_id; do
						if [ -n "$container_id" ]; then
							echo "Removing stopped Swarm container: $container_id"
							docker rm "$container_id" --force
						fi
					done
					
					echo "All stopped Swarm containers using the volume have been removed"
				else
					echo "No stopped Swarm containers using the volume found"
				fi
				
				echo "Note: Regular containers and compose containers are preserved and will be restarted later"
				
				echo ""
				echo "=== PHASE 2: All containers/services stopped - Proceeding with volume restore ==="
				
				# Remove volume and restore - ONLY ONCE!
				echo "Removing existing volume: ${volumeName}"
				docker volume rm ${volumeName} --force
				
				${baseRestoreCommand}
				
				echo ""
				echo "=== PHASE 3: Restarting all services/containers ==="
				
				# Restore all services and containers
				while read line; do
					TYPE=$(echo "$line" | cut -d':' -f1)
					DATA=$(echo "$line" | cut -d':' -f2-)
					
					if [ "$TYPE" = "SWARM" ]; then
						SERVICE_NAME=$(echo "$DATA" | cut -d':' -f1)
						REPLICAS=$(echo "$DATA" | cut -d':' -f2)
						
						if [ "$REPLICAS" != "0" ]; then
							echo "Scaling swarm service $SERVICE_NAME back to $REPLICAS replicas"
							docker service scale "$SERVICE_NAME=$REPLICAS"
						else
							echo "Leaving swarm service $SERVICE_NAME at 0 replicas (was already 0)"
						fi
						
					elif [ "$TYPE" = "STACK" ]; then
						STACK_SERVICE_NAME=$(echo "$DATA" | cut -d':' -f1)
						REPLICAS=$(echo "$DATA" | cut -d':' -f2)
						
						if [ "$REPLICAS" != "0" ]; then
							echo "Scaling stack service $STACK_SERVICE_NAME back to $REPLICAS replicas"
							docker service scale "$STACK_SERVICE_NAME=$REPLICAS"
						else
							echo "Leaving stack service $STACK_SERVICE_NAME at 0 replicas (was already 0)"
						fi
						
					elif [ "$TYPE" = "COMPOSE" ]; then
						container_id=$(echo "$DATA" | cut -d'|' -f1)
						container_name=$(echo "$DATA" | cut -d'|' -f2)
						
						echo "Starting compose container: $container_id ($container_name)"
						docker start "$container_id"
						
					elif [ "$TYPE" = "REGULAR" ]; then
						container_id=$(echo "$DATA" | cut -d'|' -f1)
						container_name=$(echo "$DATA" | cut -d'|' -f2)
						
						echo "Starting regular container: $container_id ($container_name)"
						docker start "$container_id"
					fi
				done < /tmp/dokploy_services_to_restore
				
				echo ""
				echo "✅ Volume restore completed successfully!"
				echo "✅ All services and containers have been restarted!"
				
				# Clean up temp files
				rm -f /tmp/dokploy_services_to_stop
				rm -f /tmp/dokploy_services_to_restore
			fi
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

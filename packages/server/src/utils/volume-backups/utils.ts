import type { findVolumeBackupById } from "@dokploy/server/services/volume-backups";
import { findComposeById } from "../..";

export const createVolumeBackup = async (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
) => {
	const serverId =
		volumeBackup.application?.serverId || volumeBackup.compose?.serverId;

	if (serverId) {
	} else {
	}
};

const backupVolume = async (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
) => {
	const { serviceType, volumeName, turnOff } = volumeBackup;

	const baseCommand = `
    docker run --rm \
  -v ${volumeName}:/volume_data \
  -v $(pwd):/backup \
  ubuntu \
  bash -c "cd /volume_data && tar cvf /backup/${volumeName}.tar ."
  `;

	if (turnOff) {
		return baseCommand;
	}

	if (serviceType === "application") {
		return `
        docker service scale ${volumeBackup.application?.appName}=0
        ${baseCommand}
        docker service scale ${volumeBackup.application?.appName}=1
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
            ACTUAL_REPLICAS=$(docker service inspect ${compose.appName}_${volumeBackup.serviceName} --format "{{.Spec.Mode.Replicated.Replicas}}")
            docker service scale ${compose.appName}_${volumeBackup.serviceName}=0`;
			startCommand = `docker service scale ${compose.appName}_${volumeBackup.serviceName}=$ACTUAL_REPLICAS`;
		} else {
			stopCommand = `
            ID=$(docker ps -q --filter "label=com.docker.compose.project=${compose.appName}" --filter "label=com.docker.compose.service=${volumeBackup.serviceName}")
            docker stop $ID`;
			startCommand = `
            docker start $ID`;
		}
		return `
        ${stopCommand}
        ${baseCommand}
        ${startCommand}
  `;
	}
};

import type { findVolumeBackupById } from "@dokploy/server/services/volume-backups";
import { getComposeContainer } from "../docker/utils";
import { findComposeById, paths, paths } from "../..";

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

	if (turnOff) {
		return `docker run --rm \
  -v ${volumeName}:/volume_data \
  -v $(pwd):/backup \
  ubuntu \
  bash -c "cd /volume_data && tar cvf /backup/${volumeName}.tar ."`;
	}

	if (serviceType === "application") {
		return `
        docker service scale ${volumeBackup.application?.appName}=0
        docker run --rm \
  -v ${volumeName}:/volume_data \
  -v $(pwd):/backup \
  ubuntu \
  bash -c "cd /volume_data && tar cvf /backup/${volumeName}.tar .
  docker service scale ${volumeBackup.application?.appName}=1
  "`;
	}
	if (serviceType === "compose") {
		const compose = await findComposeById(
			volumeBackup.compose?.composeId || "",
		);
        const { COMPOSE_PATH } = paths(!!compose.serverId);
		let stopCommand = "";

		if (compose.composeType === "stack") {
			stopCommand = `docker service scale ${compose.appName}_${volumeBackup.serviceName}=0`;
		} else {
			stopCommand = `docker compose down --remove-orphans`;
		}
		return `
        
        docker run --rm \
  -v ${volumeName}:/volume_data \
  -v $(pwd):/backup \
  ubuntu \
  bash -c "cd /volume_data && tar cvf /backup/${volumeName}.tar ."`;
	}

	return ``;
};

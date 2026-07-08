import { quoteShellArg } from "@dokploy/server/utils/filesystem/safe-path";

const DOCKER_VOLUME_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const DOCKER_SERVICE_NAME_REGEX = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/;

export const normalizeDockerVolumeName = (volumeName: string) => {
	const normalizedVolumeName = volumeName.trim();

	if (!DOCKER_VOLUME_NAME_REGEX.test(normalizedVolumeName)) {
		throw new Error("Invalid Docker volume name");
	}

	return normalizedVolumeName;
};

export const normalizeVolumeBackupServiceName = (serviceName: string) => {
	const normalizedServiceName = serviceName.trim();

	if (!DOCKER_SERVICE_NAME_REGEX.test(normalizedServiceName)) {
		throw new Error("Invalid service name");
	}

	return normalizedServiceName;
};

export const quoteVolumeBackupShellArg = (value: string) =>
	quoteShellArg(value);

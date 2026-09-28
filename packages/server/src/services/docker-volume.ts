import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { quote } from "shell-quote";
import { CONTAINER_FILE_SIZE_LIMIT } from "./docker";

export interface DockerVolume {
	Name: string;
	Driver: string;
	Scope: string;
	Mountpoint: string;
	Labels: string;
	Availability?: string;
	Group?: string;
	Links?: string;
	Size?: string;
	Status?: string;
}

const VOLUME_MOUNT = "/__volume";

export const getVolumes = async (serverId?: string) => {
	try {
		const command = "docker volume ls --format '{{json .}}'";
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);

		return stdout
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line) as DockerVolume);
	} catch (error) {
		console.error(error);
		return [];
	}
};

export const getVolumesSize = async (serverId?: string) => {
	try {
		const command = "docker system df -v --format '{{json .}}'";
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);

		const diskUsage = JSON.parse(stdout.trim());
		return ((diskUsage?.Volumes ?? []) as Partial<DockerVolume>[])
			.filter((volume) => volume?.Name)
			.map((volume) => ({
				name: volume.Name as string,
				size: volume.Size ?? null,
			}));
	} catch (error) {
		console.error(error);
		return [];
	}
};

export const getVolumeConfig = async (
	volumeName: string,
	serverId?: string,
) => {
	const command = `docker volume inspect ${quote([String(volumeName ?? "")])}`;
	const { stdout } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);

	return JSON.parse(stdout.trim())[0];
};

export const removeVolume = async (volumeName: string, serverId?: string) => {
	const command = `docker volume rm ${quote([String(volumeName ?? "")])}`;
	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};

export const listVolumeFiles = async (
	volumeName: string,
	path: string,
	serverId?: string,
) => {
	const command = `docker run --rm -v ${quote([`${volumeName}:${VOLUME_MOUNT}:ro`])} busybox ls -1Ap ${quote([`${VOLUME_MOUNT}${path}`])}`;
	const { stdout } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);

	return stdout
		.split("\n")
		.filter(Boolean)
		.map((entry) => ({
			name: entry.endsWith("/") ? entry.slice(0, -1) : entry,
			isDirectory: entry.endsWith("/"),
		}))
		.sort((a, b) => {
			if (a.isDirectory !== b.isDirectory) {
				return a.isDirectory ? -1 : 1;
			}
			return a.name.localeCompare(b.name);
		});
};

export const readVolumeFile = async (
	volumeName: string,
	filePath: string,
	serverId?: string,
) => {
	const command = `docker run --rm -v ${quote([`${volumeName}:${VOLUME_MOUNT}:ro`])} busybox cat ${quote([`${VOLUME_MOUNT}${filePath}`])} | head -c ${CONTAINER_FILE_SIZE_LIMIT + 1} | base64 | tr -d '\\n'`;
	const { stdout, stderr } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);

	if (stderr && !stdout) {
		throw new Error(stderr);
	}

	const buffer = Buffer.from(stdout.trim(), "base64");
	return {
		content: buffer.subarray(0, CONTAINER_FILE_SIZE_LIMIT).toString("base64"),
		truncated: buffer.byteLength > CONTAINER_FILE_SIZE_LIMIT,
	};
};

export const writeVolumeFile = async (
	volumeName: string,
	filePath: string,
	content: string,
	serverId?: string,
) => {
	const base64Content = Buffer.from(content, "utf8").toString("base64");
	if (base64Content.length > CONTAINER_FILE_SIZE_LIMIT * 2) {
		throw new Error("File is too large to save from the editor (max 512KB)");
	}

	const innerCommand = `printf '%s' ${base64Content} | base64 -d > ${quote([`${VOLUME_MOUNT}${filePath}`])}`;
	const command = `docker run --rm -v ${quote([`${volumeName}:${VOLUME_MOUNT}`])} busybox sh -c ${quote([innerCommand])}`;

	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};

export const deleteVolumeFile = async (
	volumeName: string,
	path: string,
	serverId?: string,
) => {
	const command = `docker run --rm -v ${quote([`${volumeName}:${VOLUME_MOUNT}`])} busybox rm -rf ${quote([`${VOLUME_MOUNT}${path}`])}`;

	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};

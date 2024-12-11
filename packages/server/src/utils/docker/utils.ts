import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { docker, paths } from "@dokploy/server/constants";
import type { ContainerInfo, ResourceRequirements } from "dockerode";
import { parse } from "dotenv";
import type { ApplicationNested } from "../builders";
import type { MariadbNested } from "../databases/mariadb";
import type { MongoNested } from "../databases/mongo";
import type { MysqlNested } from "../databases/mysql";
import type { PostgresNested } from "../databases/postgres";
import type { RedisNested } from "../databases/redis";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";
import { getRemoteDocker } from "../servers/remote-docker";

interface RegistryAuth {
	username: string;
	password: string;
	registryUrl: string;
}

export const pullImage = async (
	dockerImage: string,
	onData?: (data: any) => void,
	authConfig?: Partial<RegistryAuth>,
): Promise<void> => {
	try {
		if (!dockerImage) {
			throw new Error("Docker image not found");
		}

		if (authConfig?.username && authConfig?.password) {
			await spawnAsync(
				"docker",
				[
					"login",
					authConfig.registryUrl || "",
					"-u",
					authConfig.username,
					"-p",
					authConfig.password,
				],
				onData,
			);
		}
		await spawnAsync("docker", ["pull", dockerImage], onData);
	} catch (error) {
		throw error;
	}
};

export const pullRemoteImage = async (
	dockerImage: string,
	serverId: string,
	onData?: (data: any) => void,
	authConfig?: Partial<RegistryAuth>,
): Promise<void> => {
	try {
		if (!dockerImage) {
			throw new Error("Docker image not found");
		}

		const remoteDocker = await getRemoteDocker(serverId);

		await new Promise((resolve, reject) => {
			remoteDocker.pull(
				dockerImage,
				{ authconfig: authConfig },
				(err, stream) => {
					if (err) {
						reject(err);
						return;
					}

					remoteDocker.modem.followProgress(
						stream as Readable,
						(err: Error | null, res) => {
							if (!err) {
								resolve(res);
							}
							if (err) {
								reject(err);
							}
						},
						(event) => {
							onData?.(event);
						},
					);
				},
			);
		});
	} catch (error) {
		throw error;
	}
};

export const containerExists = async (containerName: string) => {
	const container = docker.getContainer(containerName);
	try {
		await container.inspect();
		return true;
	} catch (error) {
		return false;
	}
};

export const stopService = async (appName: string) => {
	try {
		await execAsync(`docker service scale ${appName}=0 `);
	} catch (error) {
		console.error(error);
		return error;
	}
};

export const stopServiceRemote = async (serverId: string, appName: string) => {
	try {
		await execAsyncRemote(serverId, `docker service scale ${appName}=0 `);
	} catch (error) {
		console.error(error);
		return error;
	}
};

export const getContainerByName = (name: string): Promise<ContainerInfo> => {
	const opts = {
		limit: 1,
		filters: {
			name: [name],
		},
	};
	return new Promise((resolve, reject) => {
		docker.listContainers(opts, (err, containers) => {
			if (err) {
				reject(err);
			} else if (containers?.length === 0) {
				reject(new Error(`No container found with name: ${name}`));
			} else if (containers && containers?.length > 0 && containers[0]) {
				resolve(containers[0]);
			}
		});
	});
};
export const cleanUpUnusedImages = async (serverId?: string) => {
	try {
		if (serverId) {
			await execAsyncRemote(serverId, "docker image prune --all --force");
		} else {
			await execAsync("docker image prune --all --force");
		}
	} catch (error) {
		console.error(error);
		throw error;
	}
};

export const cleanStoppedContainers = async (serverId?: string) => {
	try {
		if (serverId) {
			await execAsyncRemote(serverId, "docker container prune --force");
		} else {
			await execAsync("docker container prune --force");
		}
	} catch (error) {
		console.error(error);
		throw error;
	}
};

export const cleanUpUnusedVolumes = async (serverId?: string) => {
	try {
		if (serverId) {
			await execAsyncRemote(serverId, "docker volume prune --all --force");
		} else {
			await execAsync("docker volume prune --all --force");
		}
	} catch (error) {
		console.error(error);
		throw error;
	}
};

export const cleanUpInactiveContainers = async () => {
	try {
		const containers = await docker.listContainers({ all: true });
		const inactiveContainers = containers.filter(
			(container) => container.State !== "running",
		);

		for (const container of inactiveContainers) {
			await docker.getContainer(container.Id).remove({ force: true });
			console.log(`Cleaning up inactive container: ${container.Id}`);
		}
	} catch (error) {
		console.error("Error cleaning up inactive containers:", error);
		throw error;
	}
};

export const cleanUpDockerBuilder = async (serverId?: string) => {
	if (serverId) {
		await execAsyncRemote(serverId, "docker builder prune --all --force");
	} else {
		await execAsync("docker builder prune --all --force");
	}
};

export const cleanUpSystemPrune = async (serverId?: string) => {
	if (serverId) {
		await execAsyncRemote(
			serverId,
			"docker system prune --all --force --volumes",
		);
	} else {
		await execAsync("docker system prune --all --force --volumes");
	}
};

export const startService = async (appName: string) => {
	try {
		await execAsync(`docker service scale ${appName}=1 `);
	} catch (error) {
		console.error(error);
		throw error;
	}
};

export const startServiceRemote = async (serverId: string, appName: string) => {
	try {
		await execAsyncRemote(serverId, `docker service scale ${appName}=1 `);
	} catch (error) {
		console.error(error);
		throw error;
	}
};

export const removeService = async (
	appName: string,
	serverId?: string | null,
) => {
	try {
		const command = `docker service rm ${appName}`;
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
	} catch (error) {
		return error;
	}
};

export const prepareEnvironmentVariables = (
	serviceEnv: string | null,
	projectEnv?: string | null,
) => {
	const projectVars = parse(projectEnv ?? "");
	const serviceVars = parse(serviceEnv ?? "");

	const resolvedVars = Object.entries(serviceVars).map(([key, value]) => {
		let resolvedValue = value;
		if (projectVars) {
			resolvedValue = value.replace(/\$\{\{project\.(.*?)\}\}/g, (_, ref) => {
				if (projectVars[ref] !== undefined) {
					return projectVars[ref];
				}
				throw new Error(`Invalid project environment variable: project.${ref}`);
			});
		}
		return `${key}=${resolvedValue}`;
	});

	return resolvedVars;
};

export const prepareBuildArgs = (input: string | null) => {
	const pairs = (input ?? "").split("\n");

	const jsonObject: Record<string, string> = {};

	for (const pair of pairs) {
		const [key, value] = pair.split("=");
		if (key && value) {
			jsonObject[key] = value;
		}
	}

	return jsonObject;
};

export const generateVolumeMounts = (mounts: ApplicationNested["mounts"]) => {
	if (!mounts || mounts.length === 0) {
		return [];
	}

	return mounts
		.filter((mount) => mount.type === "volume")
		.map((mount) => ({
			Type: "volume" as const,
			Source: mount.volumeName || "",
			Target: mount.mountPath,
		}));
};

type Resources = {
	memoryLimit: number | null;
	memoryReservation: number | null;
	cpuLimit: number | null;
	cpuReservation: number | null;
};
export const calculateResources = ({
	memoryLimit,
	memoryReservation,
	cpuLimit,
	cpuReservation,
}: Resources): ResourceRequirements => {
	return {
		Limits: {
			MemoryBytes: memoryLimit ? memoryLimit * 1024 * 1024 : undefined,
			NanoCPUs: cpuLimit ? (cpuLimit || 1) * 1000 * 1000 * 1000 : undefined,
		},
		Reservations: {
			MemoryBytes: memoryReservation
				? (memoryReservation || 1) * 1024 * 1024
				: undefined,
			NanoCPUs: cpuReservation
				? (cpuReservation || 1) * 1000 * 1000 * 1000
				: undefined,
		},
	};
};

export const generateConfigContainer = (application: ApplicationNested) => {
	const {
		healthCheckSwarm,
		restartPolicySwarm,
		placementSwarm,
		updateConfigSwarm,
		rollbackConfigSwarm,
		modeSwarm,
		labelsSwarm,
		replicas,
		mounts,
		networkSwarm,
	} = application;

	const haveMounts = mounts.length > 0;

	return {
		...(healthCheckSwarm && {
			HealthCheck: healthCheckSwarm,
		}),
		...(restartPolicySwarm
			? {
					RestartPolicy: restartPolicySwarm,
				}
			: {}),
		...(placementSwarm
			? {
					Placement: placementSwarm,
				}
			: {
					// if app have mounts keep manager as constraint
					Placement: {
						Constraints: haveMounts ? ["node.role==manager"] : [],
					},
				}),
		...(labelsSwarm && {
			Labels: labelsSwarm,
		}),
		...(modeSwarm
			? {
					Mode: modeSwarm,
				}
			: {
					// use replicas value if no modeSwarm provided
					Mode: {
						Replicated: {
							Replicas: replicas,
						},
					},
				}),
		...(rollbackConfigSwarm && {
			RollbackConfig: rollbackConfigSwarm,
		}),
		...(updateConfigSwarm
			? { UpdateConfig: updateConfigSwarm }
			: {
					// default config if no updateConfigSwarm provided
					UpdateConfig: {
						Parallelism: 1,
						Order: "start-first",
					},
				}),
		...(networkSwarm
			? {
					Networks: networkSwarm,
				}
			: {
					Networks: [{ Target: "dokploy-network" }],
				}),
	};
};

export const generateBindMounts = (mounts: ApplicationNested["mounts"]) => {
	if (!mounts || mounts.length === 0) {
		return [];
	}

	return mounts
		.filter((mount) => mount.type === "bind")
		.map((mount) => ({
			Type: "bind" as const,
			Source: mount.hostPath || "",
			Target: mount.mountPath,
		}));
};

export const generateFileMounts = (
	appName: string,
	service:
		| ApplicationNested
		| MongoNested
		| MariadbNested
		| MysqlNested
		| PostgresNested
		| RedisNested,
) => {
	const { mounts } = service;
	const { APPLICATIONS_PATH } = paths(!!service.serverId);
	if (!mounts || mounts.length === 0) {
		return [];
	}

	return mounts
		.filter((mount) => mount.type === "file")
		.map((mount) => {
			const fileName = mount.filePath;
			const absoluteBasePath = path.resolve(APPLICATIONS_PATH);
			const directory = path.join(absoluteBasePath, appName, "files");
			const sourcePath = path.join(directory, fileName || "");
			return {
				Type: "bind" as const,
				Source: sourcePath,
				Target: mount.mountPath,
			};
		});
};

export const createFile = async (
	outputPath: string,
	filePath: string,
	content: string,
) => {
	try {
		const fullPath = path.join(outputPath, filePath);
		if (fullPath.endsWith(path.sep) || filePath.endsWith("/")) {
			fs.mkdirSync(fullPath, { recursive: true });
			return;
		}

		const directory = path.dirname(fullPath);
		fs.mkdirSync(directory, { recursive: true });
		fs.writeFileSync(fullPath, content || "");
	} catch (error) {
		throw error;
	}
};
export const encodeBase64 = (content: string) =>
	Buffer.from(content, "utf-8").toString("base64");

export const getCreateFileCommand = (
	outputPath: string,
	filePath: string,
	content: string,
) => {
	const fullPath = path.join(outputPath, filePath);
	if (fullPath.endsWith(path.sep) || filePath.endsWith("/")) {
		return `mkdir -p ${fullPath};`;
	}

	const directory = path.dirname(fullPath);
	const encodedContent = encodeBase64(content);
	return `
		mkdir -p ${directory};
		echo "${encodedContent}" | base64 -d > "${fullPath}";
	`;
};

export const getServiceContainer = async (appName: string) => {
	try {
		const filter = {
			status: ["running"],
			label: [`com.docker.swarm.service.name=${appName}`],
		};

		const containers = await docker.listContainers({
			filters: JSON.stringify(filter),
		});

		if (containers.length === 0 || !containers[0]) {
			throw new Error(`No container found with name: ${appName}`);
		}

		const container = containers[0];

		return container;
	} catch (error) {
		throw error;
	}
};

export const getRemoteServiceContainer = async (
	serverId: string,
	appName: string,
) => {
	try {
		const filter = {
			status: ["running"],
			label: [`com.docker.swarm.service.name=${appName}`],
		};
		const remoteDocker = await getRemoteDocker(serverId);
		const containers = await remoteDocker.listContainers({
			filters: JSON.stringify(filter),
		});

		if (containers.length === 0 || !containers[0]) {
			throw new Error(`No container found with name: ${appName}`);
		}

		const container = containers[0];

		return container;
	} catch (error) {
		throw error;
	}
};

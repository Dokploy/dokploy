import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { APPLICATIONS_PATH, docker } from "@/server/constants";
import type { ContainerInfo, ResourceRequirements } from "dockerode";
import { parse } from "dotenv";
import type { ApplicationNested } from "../builders";
import { execAsync } from "../process/execAsync";

interface RegistryAuth {
	username: string;
	password: string;
	serveraddress: string;
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

		await new Promise((resolve, reject) => {
			docker.pull(dockerImage, { authconfig: authConfig }, (err, stream) => {
				if (err) {
					reject(err);
					return;
				}

				docker.modem.followProgress(
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
			});
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
export const cleanUpUnusedImages = async () => {
	try {
		await execAsync("docker image prune --all --force");
	} catch (error) {
		console.error(error);
		throw error;
	}
};

export const cleanStoppedContainers = async () => {
	try {
		await execAsync("docker container prune --force");
	} catch (error) {
		console.error(error);
		throw error;
	}
};

export const cleanUpUnusedVolumes = async () => {
	try {
		await execAsync("docker volume prune --force");
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

export const cleanUpDockerBuilder = async () => {
	await execAsync("docker builder prune --all --force");
};

export const cleanUpSystemPrune = async () => {
	await execAsync("docker system prune --all --force --volumes");
};

export const startService = async (appName: string) => {
	try {
		await execAsync(`docker service scale ${appName}=1 `);
	} catch (error) {
		console.error(error);
		throw error;
	}
};

export const removeService = async (appName: string) => {
	try {
		await execAsync(`docker service rm ${appName}`);
	} catch (error) {
		return error;
	}
};

export const prepareEnvironmentVariables = (env: string | null) =>
	Object.entries(parse(env ?? "")).map(([key, value]) => `${key}=${value}`);

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
			NanoCPUs: memoryLimit ? (cpuLimit || 1) * 1000 * 1000 * 1000 : undefined,
		},
		Reservations: {
			MemoryBytes: memoryLimit
				? (memoryReservation || 1) * 1024 * 1024
				: undefined,
			NanoCPUs: memoryLimit
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
	mounts: ApplicationNested["mounts"],
) => {
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

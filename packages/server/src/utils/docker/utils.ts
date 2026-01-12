import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { docker, paths } from "@dokploy/server/constants";
import type { Compose } from "@dokploy/server/services/compose";
import type { ContainerInfo, ResourceRequirements } from "dockerode";
import { parse } from "dotenv";
import { quote } from "shell-quote";
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
	} catch {
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

/**
 * Docker commands sent using this method are held in a hold when Docker is busy.
 *
 * https://github.com/Dokploy/dokploy/pull/3064
 */
export const dockerSafeExec = (exec: string) => `
CHECK_INTERVAL=10

echo "Preparing for execution..."

while true; do
    PROCESSES=$(ps aux | grep -E "^.*docker [A-Za-z]" | grep -v grep)

    if [ -z "$PROCESSES" ]; then
        echo "Docker is idle. Starting execution..."
        break
    else
        echo "Docker is busy. Will check again in $CHECK_INTERVAL seconds..."
        sleep $CHECK_INTERVAL
    fi
done

${exec}

echo "Execution completed."
`;

const cleanupCommands = {
	containers: "docker container prune --force",
	images: "docker image prune --all --force",
	volumes: "docker volume prune --all --force",
	builders: "docker builder prune --all --force",
	system: "docker system prune --all --force",
};

export const cleanupContainers = async (serverId?: string) => {
	try {
		const command = cleanupCommands.containers;

		if (serverId) {
			await execAsyncRemote(serverId, dockerSafeExec(command));
		} else {
			await execAsync(dockerSafeExec(command));
		}
	} catch (error) {
		console.error(error);

		throw error;
	}
};

export const cleanupImages = async (serverId?: string) => {
	try {
		const command = cleanupCommands.images;

		if (serverId) {
			await execAsyncRemote(serverId, dockerSafeExec(command));
		} else await execAsync(dockerSafeExec(command));
	} catch (error) {
		console.error(error);

		throw error;
	}
};

export const cleanupVolumes = async (serverId?: string) => {
	try {
		const command = cleanupCommands.volumes;

		if (serverId) {
			await execAsyncRemote(serverId, dockerSafeExec(command));
		} else {
			await execAsync(dockerSafeExec(command));
		}
	} catch (error) {
		console.error(error);

		throw error;
	}
};

export const cleanupBuilders = async (serverId?: string) => {
	try {
		const command = cleanupCommands.builders;

		if (serverId) {
			await execAsyncRemote(serverId, dockerSafeExec(command));
		} else {
			await execAsync(dockerSafeExec(command));
		}
	} catch (error) {
		console.error(error);

		throw error;
	}
};

export const cleanupSystem = async (serverId?: string) => {
	try {
		const command = cleanupCommands.system;

		if (serverId) {
			await execAsyncRemote(serverId, dockerSafeExec(command));
		} else {
			await execAsync(dockerSafeExec(command));
		}
	} catch (error) {
		console.error(error);

		throw error;
	}
};

/**
 * Volume cleanup should always be performed manually by the user. The reason is that during automatic cleanup, a volume may be deleted due to a stopped container, which is a dangerous situation.
 *
 * https://github.com/Dokploy/dokploy/pull/3267
 */
const excludedCleanupAllCommands: (keyof typeof cleanupCommands)[] = [
	"volumes",
];

export const cleanupAll = async (serverId?: string) => {
	for (const [key, command] of Object.entries(cleanupCommands) as [
		keyof typeof cleanupCommands,
		string,
	][]) {
		if (excludedCleanupAllCommands.includes(key)) continue;

		try {
			if (serverId) {
				await execAsyncRemote(serverId, dockerSafeExec(command));
			} else {
				await execAsync(dockerSafeExec(command));
			}
		} catch {}
	}
};

export const cleanupAllBackground = async (serverId?: string) => {
	Promise.allSettled(
		(
			Object.entries(cleanupCommands) as [
				keyof typeof cleanupCommands,
				string,
			][]
		)
			.filter(([key]) => !excludedCleanupAllCommands.includes(key))
			.map(async ([, command]) => {
				if (serverId) {
					await execAsyncRemote(serverId, dockerSafeExec(command));
				} else {
					await execAsync(dockerSafeExec(command));
				}
			}),
	)
		.then((results) => {
			const failed = results.filter((r) => r.status === "rejected");
			if (failed.length > 0) {
				console.error(`Docker cleanup: ${failed.length} operations failed`);
			} else {
				console.log("Docker cleanup completed successfully");
			}
		})
		.catch((error) => console.error("Error in cleanup:", error));

	return {
		status: "scheduled",
		message: "Docker cleanup has been initiated in the background",
	};
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
	_deleteVolumes = false,
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
	environmentEnv?: string | null,
) => {
	const projectVars = parse(projectEnv ?? "");
	const environmentVars = parse(environmentEnv ?? "");
	const serviceVars = parse(serviceEnv ?? "");

	const resolvedVars = Object.entries(serviceVars).map(([key, value]) => {
		let resolvedValue = value;

		// Replace project variables
		if (projectVars) {
			resolvedValue = resolvedValue.replace(
				/\$\{\{project\.(.*?)\}\}/g,
				(_, ref) => {
					if (projectVars[ref] !== undefined) {
						return projectVars[ref];
					}
					throw new Error(
						`Invalid project environment variable: project.${ref}`,
					);
				},
			);
		}

		// Replace environment variables
		if (environmentVars) {
			resolvedValue = resolvedValue.replace(
				/\$\{\{environment\.(.*?)\}\}/g,
				(_, ref) => {
					if (environmentVars[ref] !== undefined) {
						return environmentVars[ref];
					}
					throw new Error(`Invalid environment variable: environment.${ref}`);
				},
			);
		}

		// Replace self-references (service variables)
		resolvedValue = resolvedValue.replace(/\$\{\{(.*?)\}\}/g, (_, ref) => {
			if (serviceVars[ref] !== undefined) {
				return serviceVars[ref];
			}
			throw new Error(`Invalid service environment variable: ${ref}`);
		});

		return `${key}=${resolvedValue}`;
	});

	return resolvedVars;
};

export const prepareEnvironmentVariablesForShell = (
	serviceEnv: string | null,
	projectEnv?: string | null,
	environmentEnv?: string | null,
): string[] => {
	const envVars = prepareEnvironmentVariables(
		serviceEnv,
		projectEnv,
		environmentEnv,
	);
	// Using shell-quote library to properly escape shell arguments
	// This is the standard way to handle special characters in shell commands
	return envVars.map((env) => quote([env]));
};

export const parseEnvironmentKeyValuePair = (
	pair: string,
): [string, string] => {
	const [key, ...valueParts] = pair.split("=");
	if (!key || !valueParts.length) {
		throw new Error(`Invalid environment variable pair: ${pair}`);
	}

	return [key, valueParts.join("=")];
};

export const getEnviromentVariablesObject = (
	input: string | null,
	projectEnv?: string | null,
	environmentEnv?: string | null,
) => {
	const envs = prepareEnvironmentVariables(input, projectEnv, environmentEnv);

	const jsonObject: Record<string, string> = {};

	for (const pair of envs) {
		const [key, value] = parseEnvironmentKeyValuePair(pair);
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
	memoryLimit: string | null;
	memoryReservation: string | null;
	cpuLimit: string | null;
	cpuReservation: string | null;
};
export const calculateResources = ({
	memoryLimit,
	memoryReservation,
	cpuLimit,
	cpuReservation,
}: Resources): ResourceRequirements => {
	return {
		Limits: {
			MemoryBytes: memoryLimit ? Number.parseInt(memoryLimit) : undefined,
			NanoCPUs: cpuLimit ? Number.parseInt(cpuLimit) : undefined,
		},
		Reservations: {
			MemoryBytes: memoryReservation
				? Number.parseInt(memoryReservation)
				: undefined,
			NanoCPUs: cpuReservation ? Number.parseInt(cpuReservation) : undefined,
		},
	};
};

export const generateConfigContainer = (
	application: Partial<ApplicationNested>,
) => {
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
		stopGracePeriodSwarm,
		endpointSpecSwarm,
		ulimitsSwarm,
	} = application;

	const sanitizedStopGracePeriodSwarm =
		typeof stopGracePeriodSwarm === "bigint"
			? Number(stopGracePeriodSwarm)
			: stopGracePeriodSwarm;

	const haveMounts = mounts && mounts.length > 0;

	return {
		...(healthCheckSwarm && {
			HealthCheck: healthCheckSwarm,
		}),
		...(restartPolicySwarm && {
			RestartPolicy: restartPolicySwarm,
		}),
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
		...(sanitizedStopGracePeriodSwarm !== null &&
			sanitizedStopGracePeriodSwarm !== undefined && {
				StopGracePeriod: sanitizedStopGracePeriodSwarm,
			}),
		...(networkSwarm
			? {
					Networks: networkSwarm,
				}
			: {
					Networks: [{ Target: "dokploy-network" }],
				}),
		...(endpointSpecSwarm && {
			EndpointSpec: {
				...(endpointSpecSwarm.Mode && { Mode: endpointSpecSwarm.Mode }),
				Ports:
					endpointSpecSwarm.Ports?.map((port) => ({
						Protocol: (port.Protocol || "tcp") as "tcp" | "udp" | "sctp",
						TargetPort: port.TargetPort || 0,
						PublishedPort: port.PublishedPort || 0,
						PublishMode: (port.PublishMode || "host") as "ingress" | "host",
					})) || [],
			},
		}),
		...(ulimitsSwarm &&
			ulimitsSwarm.length > 0 && {
				Ulimits: ulimitsSwarm,
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

export const getServiceContainer = async (
	appName: string,
	serverId?: string | null,
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
			return null;
		}

		const container = containers[0];

		return container;
	} catch (error) {
		throw error;
	}
};

export const getComposeContainer = async (
	compose: Compose,
	serviceName: string,
) => {
	try {
		const { appName, composeType, serverId } = compose;
		// 1. Determine the correct labels based on composeType
		const labels: string[] = [];
		if (composeType === "stack") {
			// Labels for Docker Swarm stack services
			labels.push(`com.docker.stack.namespace=${appName}`);
			labels.push(`com.docker.swarm.service.name=${appName}_${serviceName}`);
		} else {
			// Labels for Docker Compose projects (default)
			labels.push(`com.docker.compose.project=${appName}`);
			labels.push(`com.docker.compose.service=${serviceName}`);
		}
		const filter = {
			status: ["running"],
			label: labels,
		};

		const remoteDocker = await getRemoteDocker(serverId);
		const containers = await remoteDocker.listContainers({
			filters: JSON.stringify(filter),
			limit: 1,
		});

		if (containers.length === 0 || !containers[0]) {
			return null;
		}

		const container = containers[0];
		return container;
	} catch (error) {
		throw error;
	}
};

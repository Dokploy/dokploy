import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { docker, paths } from "@dokploy/server/constants";
import type { Compose } from "@dokploy/server/services/compose";
import type { ContainerInfo, ResourceRequirements } from "dockerode";
import { parse } from "dotenv";
import { quote } from "shell-quote";
import { loginDockerToECR } from "../aws/ecr";
import type { ApplicationNested } from "../builders";
import type { LibsqlNested } from "../databases/libsql";
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
	/** AWS ECR credentials for SDK-based token acquisition and Docker login. */
	ecr?: {
		awsAccessKeyId?: string;
		awsSecretAccessKey?: string;
		awsRegion?: string;
	};
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

		if (authConfig?.ecr) {
			await loginDockerToECR({
				awsAccessKeyId: authConfig.ecr.awsAccessKeyId || "",
				awsSecretAccessKey: authConfig.ecr.awsSecretAccessKey || "",
				awsRegion: authConfig.ecr.awsRegion || "",
				registryUrl: authConfig.registryUrl,
			});
		} else if (authConfig?.username && authConfig?.password) {
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

		// Handle ECR authentication for remote servers
		if (authConfig?.ecr) {
			await loginDockerToECR(
				{
					awsAccessKeyId: authConfig.ecr.awsAccessKeyId || "",
					awsSecretAccessKey: authConfig.ecr.awsSecretAccessKey || "",
					awsRegion: authConfig.ecr.awsRegion || "",
					registryUrl: authConfig.registryUrl,
				},
				serverId,
			);
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
export const dockerIdleExec = (command: string) => `
check_interval=10
max_wait=300
waited=0

echo "Preparing for execution..."

while true; do
  docker_processes=$(pgrep -af "(docker|podman) [a-zA-Z]")

  if [ -z "\${docker_processes}" ]; then
    echo "Docker is idle. Starting execution..."

    break
  fi

  if [ "\${waited}" -ge "\${max_wait}" ]; then
    echo "Docker still busy after \${max_wait}s, proceeding anyway." >&2

    break
  fi

  echo "Docker is busy. It will check again in \${check_interval} seconds..."

  sleep "\${check_interval}"
  waited=$((waited + check_interval))
done

${command}

echo "Execution completed."
`;

const cleanupCommands = {
	containers: dockerIdleExec("docker container prune --force"),
	images: dockerIdleExec("docker image prune --all --force"),
	volumes: dockerIdleExec("docker volume prune --all --force"),
	builders: dockerIdleExec("docker builder prune --all --force"),
	system: dockerIdleExec("docker system prune --all --force"),
};

export const cleanupContainers = async (serverId?: string) => {
	try {
		const command = cleanupCommands.containers;

		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
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
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
	} catch (error) {
		console.error(error);

		throw error;
	}
};

export const cleanupVolumes = async (serverId?: string) => {
	try {
		const command = cleanupCommands.volumes;

		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
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
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
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
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
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
				await execAsyncRemote(serverId, command);
			} else {
				await execAsync(command);
			}
		} catch (error) {
			console.error(
				`Docker cleanup: "${key}" failed${serverId ? ` on server ${serverId}` : ""}`,
				error,
			);
		}
	}
};

export interface DockerDiskUsageItem {
	type: string;
	totalCount: number;
	active: number;
	size: string;
	reclaimable: string;
	sizeBytes: number;
}

const parseSizeToBytes = (size: string): number => {
	const match = size.match(/^([\d.]+)\s*([KMGT]?B)$/i);
	if (!match) return 0;
	const value = Number.parseFloat(match[1] as string);
	const unit = (match[2] as string).toUpperCase();
	const multipliers: Record<string, number> = {
		B: 1,
		KB: 1024,
		MB: 1024 ** 2,
		GB: 1024 ** 3,
		TB: 1024 ** 4,
	};
	return value * (multipliers[unit] || 0);
};

export const getDockerDiskUsage = async (
	serverId?: string,
): Promise<DockerDiskUsageItem[]> => {
	const command = "docker system df --format '{{json .}}'";
	const { stdout } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);

	const lines = stdout.trim().split("\n").filter(Boolean);
	return lines.map((line) => {
		const data = JSON.parse(line);
		return {
			type: data.Type,
			totalCount: Number.parseInt(data.TotalCount, 10) || 0,
			active: Number.parseInt(data.Active, 10) || 0,
			size: data.Size,
			reclaimable: data.Reclaimable,
			sizeBytes: parseSizeToBytes(data.Size),
		};
	});
};

export interface DockerBuildCacheItem {
	id: string;
	type: string;
	description: string;
	size: string;
	sizeBytes: number;
	createdSince: string;
	lastUsedSince: string;
	usageCount: number;
	shared: boolean;
	inUse: boolean;
}

export const getBuildCache = async (
	serverId?: string,
): Promise<DockerBuildCacheItem[]> => {
	try {
		const command = "docker system df -v --format '{{json .}}'";
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);

		const diskUsage = JSON.parse(stdout.trim());
		return ((diskUsage?.BuildCache ?? []) as Record<string, string>[]).map(
			(entry) => ({
				id: entry.ID ?? "",
				type: entry.CacheType ?? "",
				description: entry.Description ?? "",
				size: entry.Size ?? "",
				sizeBytes: parseSizeToBytes(entry.Size ?? ""),
				createdSince: entry.CreatedSince ?? "",
				lastUsedSince: entry.LastUsedSince ?? "",
				usageCount: Number.parseInt(entry.UsageCount ?? "0", 10) || 0,
				shared: entry.Shared === "true",
				inUse: entry.InUse === "true",
			}),
		);
	} catch (error) {
		console.error(error);
		return [];
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
	serviceFqdns?: Record<string, string> | null,
) => {
	for (const source of [serviceEnv, projectEnv, environmentEnv]) {
		if (source?.includes("${{vault.")) {
			throw new Error(
				"Unresolved vault reference: call withResolvedVaultRefs() on the entity before preparing environment variables",
			);
		}
	}
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

		// Replace cross-service references: ${{service.<name>.fqdn}}
		// Resolves to the public URL of another service in the same environment.
		// The name->fqdn map is precomputed by the caller (it requires a DB
		// lookup); this keeps the function pure and synchronous.
		resolvedValue = resolvedValue.replace(
			/\$\{\{service\.(.*?)\.fqdn\}\}/g,
			(_, name) => {
				if (serviceFqdns && serviceFqdns[name] !== undefined) {
					return serviceFqdns[name];
				}
				throw new Error(`Invalid service reference: service.${name}.fqdn`);
			},
		);

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

export interface PredefinedEnvApplication {
	applicationId: string;
	appName: string;
	name: string;
	branch?: string | null;
	sourceType?: string | null;
	dockerImage?: string | null;
	environment: {
		name: string;
		project: {
			name: string;
		};
	};
}

export interface PredefinedEnvDomain {
	host: string;
	https?: boolean | null;
	port?: number | null;
}

/**
 * Extracts the tag portion of a docker image reference, ignoring any registry
 * host[:port]/ prefix and digest (`@sha256:...`) suffix. Falls back to
 * `latest` when no explicit tag is present (matching Docker's own default).
 */
const getDockerImageTag = (dockerImage: string): string => {
	const lastSlash = dockerImage.lastIndexOf("/");
	const nameAndTag =
		lastSlash === -1 ? dockerImage : dockerImage.slice(lastSlash + 1);
	const atIndex = nameAndTag.indexOf("@");
	const withoutDigest =
		atIndex === -1 ? nameAndTag : nameAndTag.slice(0, atIndex);
	const colon = withoutDigest.lastIndexOf(":");
	if (colon === -1) {
		return "latest";
	}
	return withoutDigest.slice(colon + 1) || "latest";
};

/**
 * Computes the Dokploy-provided predefined environment variables (`DOKPLOY_*`)
 * for an application. Every value is derived from data already persisted on the
 * application, its environment/project and its primary domain — so this needs
 * no schema changes. Injected at deploy time (see `mechanizeDockerContainer`),
 * they let an app read its own domain/identity without the user duplicating it,
 * and can be referenced from user env, e.g. `NEXTAUTH_URL=${{DOKPLOY_URL}}`.
 *
 * Implements a subset of Dokploy/dokploy#3829. Vars that would require data the
 * fork does not persist (commit SHA, image digest) or a new schema column
 * (user-selectable primary domain) are intentionally omitted — see PR notes.
 */
export const getPredefinedEnvVariables = (
	application: PredefinedEnvApplication,
	domain?: PredefinedEnvDomain | null,
): Record<string, string> => {
	const variables: Record<string, string> = {
		DOKPLOY_APPLICATION_ID: application.applicationId,
		DOKPLOY_CONTAINER_NAME: application.appName,
		DOKPLOY_APP_NAME: application.name,
		DOKPLOY_PROJECT_NAME: application.environment.project.name,
		DOKPLOY_ENVIRONMENT_NAME: application.environment.name,
	};

	if (application.branch && application.sourceType !== "docker") {
		variables.DOKPLOY_BRANCH = application.branch;
	}

	if (application.sourceType === "docker" && application.dockerImage) {
		variables.DOKPLOY_IMAGE_TAG = getDockerImageTag(application.dockerImage);
	}

	if (domain?.host) {
		const scheme = domain.https ? "https" : "http";
		variables.DOKPLOY_FQDN = domain.host;
		variables.DOKPLOY_URL = `${scheme}://${domain.host}`;
		if (domain.port !== null && domain.port !== undefined) {
			variables.DOKPLOY_PORT = String(domain.port);
		}
	}

	return variables;
};

/**
 * Prepends the predefined `DOKPLOY_*` variables to a service's raw env string,
 * skipping any key the user has already defined so an explicit user value always
 * wins. The result is fed to `prepareEnvironmentVariables`, so predefined vars
 * are both present in the container env and available for `${{...}}` references.
 */
export const mergePredefinedEnvVariables = (
	predefined: Record<string, string>,
	serviceEnv: string | null,
): string => {
	const userVars = parse(serviceEnv ?? "");
	const lines = Object.entries(predefined)
		.filter(([key]) => !(key in userVars))
		.map(([key, value]) => `${key}=${value}`);
	if (serviceEnv && serviceEnv.length > 0) {
		lines.push(serviceEnv);
	}
	return lines.join("\n");
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

export const prepareEnvironmentVariablesForFile = (
	serviceEnv: string | null,
	projectEnv?: string | null,
	environmentEnv?: string | null,
): string[] => {
	const envVars = prepareEnvironmentVariables(
		serviceEnv,
		projectEnv,
		environmentEnv,
	);

	return envVars.map((pair) => {
		const [key, value] = parseEnvironmentKeyValuePair(pair);
		const escapedValue = value
			.replace(/\\/g, "\\\\")
			.replace(/"/g, '\\"')
			.replace(/\$(?!\{[A-Za-z_][A-Za-z0-9_]*(?::?[-+?][^{}]*)?\})/g, "\\$");
		return `${key}="${escapedValue}"`;
	});
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

export const getEnvironmentVariablesObject = (
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
		stopGracePeriodSwarm,
		endpointSpecSwarm,
		ulimitsSwarm,
	} = application;

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
		...(rollbackConfigSwarm
			? { RollbackConfig: rollbackConfigSwarm }
			: {
					// default rollback config to match update config
					RollbackConfig: {
						Parallelism: 1,
						Order: "start-first",
					},
				}),
		...(updateConfigSwarm
			? { UpdateConfig: updateConfigSwarm }
			: {
					// default config if no updateConfigSwarm provided
					UpdateConfig: {
						Parallelism: 1,
						Order: "start-first",
						FailureAction: "rollback",
					},
				}),
		...(stopGracePeriodSwarm !== null &&
			stopGracePeriodSwarm !== undefined && {
				StopGracePeriod: stopGracePeriodSwarm,
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
		| LibsqlNested
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
		return `mkdir -p ${quote([fullPath])};`;
	}

	const directory = path.dirname(fullPath);
	const encodedContent = encodeBase64(content);
	return `
		mkdir -p ${quote([directory])};
		echo "${encodedContent}" | base64 -d > ${quote([fullPath])};
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

type ServiceHealthStatus = {
	status: "healthy" | "unhealthy";
	message?: string;
};

const checkSwarmServiceRunning = async (
	serviceName: string,
): Promise<ServiceHealthStatus> => {
	try {
		const service = docker.getService(serviceName);
		const info = await service.inspect();
		const replicas = info.Spec?.Mode?.Replicated?.Replicas ?? 0;
		if (replicas === 0) {
			return {
				status: "unhealthy",
				message: "Service has 0 replicas configured",
			};
		}

		// Check that at least one task is actually running
		const tasks = await docker.listTasks({
			filters: JSON.stringify({
				service: [serviceName],
				"desired-state": ["running"],
			}),
		});

		const runningTask = tasks.find((t) => t.Status?.State === "running");

		if (!runningTask) {
			const latestTask = tasks[0];
			const taskState = latestTask?.Status?.State ?? "unknown";
			return {
				status: "unhealthy",
				message: `No running tasks (current state: ${taskState})`,
			};
		}

		return { status: "healthy" };
	} catch (error) {
		return {
			status: "unhealthy",
			message: error instanceof Error ? error.message : "Service not found",
		};
	}
};

const getSwarmServiceContainerId = async (
	serviceName: string,
): Promise<string | null> => {
	try {
		const tasks = await docker.listTasks({
			filters: JSON.stringify({
				service: [serviceName],
				"desired-state": ["running"],
			}),
		});

		const runningTask = tasks.find((t) => t.Status?.State === "running");

		return runningTask?.Status?.ContainerStatus?.ContainerID ?? null;
	} catch {
		return null;
	}
};

export type SwarmStabilityResult =
	// `containerId` is the container of the last task observed in the `running`
	// state during the stability window. Callers that need to exec into the
	// freshly deployed task (post-deploy hooks) should use it instead of
	// re-resolving the container by service label: during a `start-first`
	// rolling update the outgoing and incoming tasks briefly share that label,
	// so a label lookup can return the container that is about to go away.
	// Optional because Swarm may not have populated `ContainerStatus` yet.
	{ stable: true; containerId?: string } | { stable: false; reason: string };

// Swarm task states that precede `running`; `preparing` covers the image pull.
const PRE_RUNNING_TASK_STATES = [
	"new",
	"pending",
	"assigned",
	"accepted",
	"preparing",
	"starting",
];

export const waitForSwarmServiceStable = async (
	appName: string,
	{
		serverId,
		windowMs = 60_000,
		pollMs = 5_000,
		maxWaitMs = 10 * 60_000,
		postRunningObserveMs = 30_000,
	}: {
		serverId?: string | null;
		windowMs?: number;
		pollMs?: number;
		// Upper bound (measured from the poll start) while the newest task is
		// still in a pre-running state, i.e. the node is pulling a large image.
		maxWaitMs?: number;
		// Minimum observation time after the first `running` moment of a deploy
		// whose window was extended for an image pull, so a crash-on-boot is
		// still caught.
		postRunningObserveMs?: number;
	} = {},
): Promise<SwarmStabilityResult> => {
	const remoteDocker = await getRemoteDocker(serverId);

	// Swarm timestamps (`Task.CreatedAt`, `Task.UpdatedAt`) come from the
	// target daemon's clock, which can drift from ours on remote servers.
	// Anchor the time gates to the daemon's own clock so `CreatedAt` /
	// `UpdatedAt` comparisons stay meaningful under skew. `deadline` stays
	// on our clock — it's just a local timer for the poll loop.
	let clockOffsetMs = 0;
	try {
		const info = await remoteDocker.info();
		const daemonNowMs = new Date(info.SystemTime).getTime();
		if (Number.isFinite(daemonNowMs)) {
			clockOffsetMs = daemonNowMs - Date.now();
		}
	} catch {
		// Fall back to our own clock — no worse than the pre-anchor behavior.
	}

	const pollStartMs = Date.now();
	const daemonPollStartMs = pollStartMs + clockOffsetMs;
	const baseDeadline = pollStartMs + windowMs;
	// Hard cap for the image-pull extension; never below the base window.
	const maxDeadline = pollStartMs + Math.max(windowMs, maxWaitMs);
	let deadline = baseDeadline;
	// Set once the window was stretched because the newest task is still
	// pulling/starting and nothing from this deployment has run yet.
	let extendedForPull = false;
	let lastPreRunningState: string | undefined;
	let lastPreRunningMessage = "";
	let everRunning = false;
	let lastRunningContainerId: string | undefined;
	let lastReason = "Service did not reach running state";

	while (Date.now() < deadline) {
		try {
			const tasks = await remoteDocker.listTasks({
				filters: JSON.stringify({ service: [appName] }),
			});

			// Look for failed/rejected tasks anywhere in the current task set —
			// after a rollback the failed task's DesiredState is moved to
			// "shutdown", so filtering by desired-state would hide it. Restrict
			// to failures updated since we started polling to avoid triggering
			// on stale history from previous deploys that Swarm still retains.
			const recentlyFailed = tasks.find(
				(t) =>
					(t.Status?.State === "failed" || t.Status?.State === "rejected") &&
					new Date(t.UpdatedAt ?? 0).getTime() >= daemonPollStartMs,
			);
			if (recentlyFailed) {
				const state = recentlyFailed.Status?.State;
				const message =
					recentlyFailed.Status?.Err || recentlyFailed.Status?.Message || "";
				return {
					stable: false,
					reason: message
						? `Task ${state}: ${message}`
						: `Task entered ${state} state`,
				};
			}

			// Stability counts must exclude:
			//   1. tasks Swarm has already marked for shutdown (the outgoing
			//      task once the rolling update has flipped it), and
			//   2. tasks created before this poll started — Swarm briefly
			//      keeps the outgoing task at DesiredState="running" while the
			//      new task boots, so filtering on DesiredState alone still
			//      lets the outgoing task set `everRunning=true`, and the
			//      subsequent handover (outgoing → shutdown, incoming still
			//      starting) then trips the "restarted after running" branch.
			// Small leeway so a task created in the sub-second between the
			// service update call and our first Date.now() still counts.
			const CREATED_AT_LEEWAY_MS = 5_000;
			const active = tasks.filter(
				(t) =>
					t.DesiredState === "running" &&
					new Date(t.CreatedAt ?? 0).getTime() >=
						daemonPollStartMs - CREATED_AT_LEEWAY_MS,
			);
			const sorted = [...active].sort((a, b) => {
				const at = new Date(a.UpdatedAt ?? 0).getTime();
				const bt = new Date(b.UpdatedAt ?? 0).getTime();
				return bt - at;
			});
			const latest = sorted[0];
			const state = latest?.Status?.State;
			const message = latest?.Status?.Err || latest?.Status?.Message || "";
			const runningCount = active.filter(
				(t) => t.Status?.State === "running",
			).length;
			const startingCount = active.filter((t) =>
				PRE_RUNNING_TASK_STATES.includes(t.Status?.State ?? ""),
			).length;

			const latestIsPreRunning = PRE_RUNNING_TASK_STATES.includes(state ?? "");
			if (runningCount === 0 && !everRunning && latestIsPreRunning) {
				// Nothing from this deployment has run yet and the newest task is
				// still pulling/starting (a large image from the registry can take
				// well over the base window). Keep waiting, bounded by maxWaitMs.
				extendedForPull = true;
				lastPreRunningState = state;
				lastPreRunningMessage = message;
				deadline = maxDeadline;
			}

			if (runningCount > 0) {
				if (!everRunning && extendedForPull) {
					// First running moment after an extended wait: observe for at
					// least `postRunningObserveMs` so a crash-on-boot is still
					// caught, without ever shrinking the original window.
					deadline = Math.max(baseDeadline, Date.now() + postRunningObserveMs);
				}
				everRunning = true;
				// `sorted` is the active task set newest-first, so this tracks the
				// most recently updated running task — the one this deployment
				// just brought up.
				const newestRunning = sorted.find((t) => t.Status?.State === "running");
				const containerId = newestRunning?.Status?.ContainerStatus?.ContainerID;
				if (containerId) {
					lastRunningContainerId = containerId;
				}
			} else if (everRunning && startingCount > 0) {
				return {
					stable: false,
					reason: message
						? `Container restarted after running: ${message}`
						: "Container restarted after reaching running state",
				};
			}

			lastReason =
				active.length === 0
					? "No tasks from this deployment found"
					: message
						? `Latest task state: ${state ?? "unknown"} (${message})`
						: `Latest task state: ${state ?? "unknown"}`;
		} catch (error) {
			lastReason =
				error instanceof Error ? error.message : "Failed to inspect service";
		}

		await new Promise((resolve) => setTimeout(resolve, pollMs));
	}

	if (everRunning) {
		// Spread rather than always setting the key so existing callers (and
		// their `toEqual({ stable: true })` assertions) see an unchanged shape
		// when Swarm never reported a container id.
		return {
			stable: true,
			...(lastRunningContainerId
				? { containerId: lastRunningContainerId }
				: {}),
		};
	}
	if (extendedForPull) {
		return {
			stable: false,
			reason: `Task still ${lastPreRunningState ?? "starting"} (image pull) after ${Math.max(windowMs, maxWaitMs)}ms${
				lastPreRunningMessage ? `: ${lastPreRunningMessage}` : ""
			}`,
		};
	}
	return { stable: false, reason: lastReason };
};

export class ServiceConvergenceError extends Error {}

export const waitForSwarmServiceConvergence = async (
	appName: string,
	serverId?: string | null,
	options?: { timeoutMs?: number; intervalMs?: number },
): Promise<void> => {
	const timeoutMs = options?.timeoutMs ?? 45_000;
	const intervalMs = options?.intervalMs ?? 2_000;
	const remoteDocker = await getRemoteDocker(serverId);
	const service = remoteDocker.getService(appName);
	const deadline = Date.now() + timeoutMs;

	let lastState = "unknown";
	while (true) {
		const info = await service.inspect();
		const desiredTasksCount = info.Spec?.Mode?.Replicated?.Replicas ?? 1;

		const tasks = await remoteDocker.listTasks({
			filters: JSON.stringify({ service: [appName] }),
		});
		const currentTasks = tasks.filter(
			(task) => task.DesiredState === "running",
		);
		const runningTasksCount = currentTasks.filter(
			(task) => task.Status?.State === "running",
		).length;

		if (runningTasksCount >= desiredTasksCount) {
			return;
		}

		const failedTask = currentTasks.find((task) =>
			["failed", "rejected"].includes(task.Status?.State ?? ""),
		);
		lastState =
			failedTask?.Status?.Err ??
			failedTask?.Status?.State ??
			currentTasks[0]?.Status?.State ??
			lastState;

		if (Date.now() >= deadline) {
			throw new ServiceConvergenceError(
				`Service ${appName} did not converge within ${timeoutMs}ms: ${runningTasksCount}/${desiredTasksCount} tasks running (last state: ${lastState})`,
			);
		}

		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
};

export const checkPostgresHealth = async (): Promise<ServiceHealthStatus> => {
	const serviceCheck = await checkSwarmServiceRunning("dokploy-postgres");
	if (serviceCheck.status === "unhealthy") {
		return serviceCheck;
	}

	// Verify PostgreSQL actually accepts connections
	const containerId = await getSwarmServiceContainerId("dokploy-postgres");
	if (!containerId) {
		return { status: "unhealthy", message: "Could not find running container" };
	}

	try {
		const exec = await docker.getContainer(containerId).exec({
			Cmd: ["pg_isready", "-U", "dokploy"],
			AttachStdout: true,
			AttachStderr: true,
		});
		const stream = await exec.start({});

		const output = await new Promise<string>((resolve) => {
			let data = "";
			stream.on("data", (chunk: Buffer) => {
				data += chunk.toString();
			});
			stream.on("end", () => resolve(data));
		});

		const inspectResult = await exec.inspect();
		if (inspectResult.ExitCode !== 0) {
			return {
				status: "unhealthy",
				message: `PostgreSQL not ready: ${output.trim()}`,
			};
		}

		return { status: "healthy" };
	} catch (error) {
		return {
			status: "unhealthy",
			message:
				error instanceof Error ? error.message : "Failed to check PostgreSQL",
		};
	}
};

export const checkTraefikHealth = async (): Promise<ServiceHealthStatus> => {
	// Traefik can run as a standalone container or a swarm service
	try {
		const container = docker.getContainer("dokploy-traefik");
		const info = await container.inspect();
		if (!info.State.Running) {
			return {
				status: "unhealthy",
				message: "Container is not running",
			};
		}
		return { status: "healthy" };
	} catch {
		// Not a standalone container, check as swarm service
		return checkSwarmServiceRunning("dokploy-traefik");
	}
};

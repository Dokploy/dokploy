import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { docker, paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { networks } from "@dokploy/server/db/schema";
import type { Compose } from "@dokploy/server/services/compose";
import type { ContainerInfo, ResourceRequirements } from "dockerode";
import { parse } from "dotenv";
import { inArray } from "drizzle-orm";
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
export const cleanUpUnusedImages = async (serverId?: string) => {
	try {
		const command = "docker image prune --force";
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

export const cleanStoppedContainers = async (serverId?: string) => {
	try {
		const command = "docker container prune --force";
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

export const cleanUpUnusedVolumes = async (serverId?: string) => {
	try {
		const command = "docker volume prune --force";
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
	const command = "docker builder prune --all --force";
	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};

export const cleanUpSystemPrune = async (serverId?: string) => {
	const command = "docker system prune --force --volumes";
	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
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

const resolveTraefikNetwork = async (
	customNetworkIds: string[] | null | undefined,
): Promise<string> => {
	if (!customNetworkIds || customNetworkIds.length === 0) {
		return "dokploy-network";
	}

	const customNetworks = await db.query.networks.findMany({
		where: inArray(networks.networkId, customNetworkIds),
	});

	return customNetworks[0]?.networkName ?? "dokploy-network";
};

/**
 * Resolve Traefik network with priority system:
 * 1. First non-null, non-internal domain.networkId (highest priority)
 * 2. First non-internal custom network from customNetworkIds
 * 3. dokploy-network (fallback)
 */
const resolveTraefikNetworkWithDomains = async (
	domains: Array<{ networkId: string | null }>,
	customNetworkIds: string[] | null | undefined,
): Promise<string> => {
	// Priority 1: Check if any domain has a specific network selected
	const domainNetworkIds = domains
		.map((d) => d.networkId)
		.filter((id): id is string => id !== null);

	if (domainNetworkIds.length > 0) {
		// Find the first valid, non-internal network from domain selections
		const domainNetworks = await db.query.networks.findMany({
			where: inArray(networks.networkId, domainNetworkIds),
		});

		const nonInternalDomainNetwork = domainNetworks.find((n) => !n.internal);
		if (nonInternalDomainNetwork) {
			console.log(
				`Using domain-specific network: ${nonInternalDomainNetwork.networkName}`,
			);
			return nonInternalDomainNetwork.networkName;
		}
	}

	// Priority 2: Fall back to first non-internal custom network
	if (customNetworkIds && customNetworkIds.length > 0) {
		const customNetworks = await db.query.networks.findMany({
			where: inArray(networks.networkId, customNetworkIds),
		});

		const nonInternalCustomNetwork = customNetworks.find((n) => !n.internal);
		if (nonInternalCustomNetwork) {
			console.log(
				`Using custom network: ${nonInternalCustomNetwork.networkName}`,
			);
			return nonInternalCustomNetwork.networkName;
		}
	}

	// Priority 3: Final fallback to dokploy-network
	console.log("Using default network: dokploy-network");
	return "dokploy-network";
};

const buildRouterRule = (host: string, domainPath?: string | null): string => {
	const pathRule =
		domainPath && domainPath !== "/" ? ` && PathPrefix(\`${domainPath}\`)` : "";
	return `Host(\`${host}\`)${pathRule}`;
};

const collectMiddlewares = (
	appName: string,
	uniqueConfigKey: string,
	domainPath: string | null | undefined,
	stripPath: boolean | null,
	internalPath: string | null | undefined,
	includeHttpsRedirect: boolean,
): string[] => {
	const middlewares: string[] = [];

	if (includeHttpsRedirect) {
		middlewares.push("redirect-to-https@file");
	}

	if (stripPath && domainPath && domainPath !== "/") {
		const middlewareName = `stripprefix-${appName}-${uniqueConfigKey}`;
		middlewares.push(middlewareName);
	}

	if (internalPath && internalPath !== "/" && internalPath.startsWith("/")) {
		const middlewareName = `addprefix-${appName}-${uniqueConfigKey}`;
		middlewares.push(middlewareName);
	}

	return middlewares;
};

const generateDomainLabels = async (
	applicationId: string,
	appName: string,
	customNetworkIds: string[] | null | undefined,
): Promise<Record<string, string>> => {
	const application = await db.query.applications.findFirst({
		where: (applications, { eq }) =>
			eq(applications.applicationId, applicationId),
		with: {
			domains: true,
		},
	});

	if (!application?.domains || application.domains.length === 0) {
		return {};
	}

	const labels: Record<string, string> = {
		"traefik.enable": "true",
		"traefik.docker.network": await resolveTraefikNetworkWithDomains(
			application.domains,
			customNetworkIds,
		),
	};

	for (const domain of application.domains) {
		const {
			host,
			port,
			https,
			uniqueConfigKey,
			certificateType,
			path: domainPath,
			customCertResolver,
			stripPath,
			internalPath,
		} = domain;

		if (!port) {
			continue;
		}

		const routerName = `${appName}-${uniqueConfigKey}`;
		const serviceName = `${appName}-service-${uniqueConfigKey}`;
		const webRouterName = `${routerName}-web`;
		const routerRule = buildRouterRule(host, domainPath);

		labels[`traefik.http.routers.${webRouterName}.rule`] = routerRule;
		labels[`traefik.http.routers.${webRouterName}.entrypoints`] = "web";
		labels[`traefik.http.routers.${webRouterName}.service`] = serviceName;
		labels[`traefik.http.services.${serviceName}.loadbalancer.server.port`] =
			port.toString();

		const webMiddlewares = collectMiddlewares(
			appName,
			uniqueConfigKey.toString(),
			domainPath,
			stripPath,
			internalPath,
			https ?? false,
		);

		if (webMiddlewares.length > 0) {
			labels[`traefik.http.routers.${webRouterName}.middlewares`] =
				webMiddlewares.join(",");
		}

		if (stripPath && domainPath && domainPath !== "/") {
			const middlewareName = `stripprefix-${appName}-${uniqueConfigKey}`;
			labels[
				`traefik.http.middlewares.${middlewareName}.stripprefix.prefixes`
			] = domainPath;
		}

		if (internalPath && internalPath !== "/" && internalPath.startsWith("/")) {
			const middlewareName = `addprefix-${appName}-${uniqueConfigKey}`;
			labels[`traefik.http.middlewares.${middlewareName}.addprefix.prefix`] =
				internalPath;
		}

		if (https) {
			const websecureRouterName = `${routerName}-websecure`;

			labels[`traefik.http.routers.${websecureRouterName}.rule`] = routerRule;
			labels[`traefik.http.routers.${websecureRouterName}.entrypoints`] =
				"websecure";
			labels[`traefik.http.routers.${websecureRouterName}.service`] =
				serviceName;

			const websecureMiddlewares = collectMiddlewares(
				appName,
				uniqueConfigKey.toString(),
				domainPath,
				stripPath,
				internalPath,
				false,
			);

			if (websecureMiddlewares.length > 0) {
				labels[`traefik.http.routers.${websecureRouterName}.middlewares`] =
					websecureMiddlewares.join(",");
			}

			if (certificateType === "letsencrypt") {
				labels[`traefik.http.routers.${websecureRouterName}.tls.certresolver`] =
					"letsencrypt";
			} else if (certificateType === "custom" && customCertResolver) {
				labels[`traefik.http.routers.${websecureRouterName}.tls.certresolver`] =
					customCertResolver;
			}
		}
	}

	return labels;
};

export const generateConfigContainer = async (
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
		customNetworkIds,
		stopGracePeriodSwarm,
		applicationId,
		appName,
	} = application;

	const sanitizedStopGracePeriodSwarm =
		typeof stopGracePeriodSwarm === "bigint"
			? Number(stopGracePeriodSwarm)
			: stopGracePeriodSwarm;

	const haveMounts = mounts && mounts.length > 0;

	let networksToUse: Array<{ Target?: string }>;

	if (networkSwarm) {
		networksToUse = networkSwarm;
	} else if (customNetworkIds && customNetworkIds.length > 0) {
		const customNetworks = await db.query.networks.findMany({
			where: inArray(networks.networkId, customNetworkIds),
		});
		networksToUse = customNetworks.map((net) => ({ Target: net.networkName }));
	} else {
		networksToUse = [{ Target: "dokploy-network" }];
	}

	const generatedLabels =
		applicationId && appName
			? await generateDomainLabels(applicationId, appName, customNetworkIds)
			: {};

	const finalLabels = {
		...labelsSwarm,
		...generatedLabels,
	};

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
					Placement: {
						Constraints: haveMounts ? ["node.role==manager"] : [],
					},
				}),
		...(Object.keys(finalLabels).length > 0 && {
			Labels: finalLabels,
		}),
		...(modeSwarm
			? {
					Mode: modeSwarm,
				}
			: {
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
					UpdateConfig: {
						Parallelism: 1,
						Order: "start-first",
					},
				}),
		...(sanitizedStopGracePeriodSwarm !== null &&
			sanitizedStopGracePeriodSwarm !== undefined && {
				StopGracePeriod: sanitizedStopGracePeriodSwarm,
			}),
		Networks: networksToUse,
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
		const labels: string[] = [];
		if (composeType === "stack") {
			labels.push(`com.docker.stack.namespace=${appName}`);
			labels.push(`com.docker.swarm.service.name=${appName}_${serviceName}`);
		} else {
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

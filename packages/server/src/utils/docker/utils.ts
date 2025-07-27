import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { docker, paths } from "@dokploy/server/constants";
import type { Compose } from "@dokploy/server/services/compose";
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
	serviceId?: string,
	serviceType?: string,
) => {
	const projectVars = parse(projectEnv ?? "");
	const serviceVars = parse(serviceEnv ?? "");

	const resolvedVars = Object.entries(serviceVars).map(([key, value]) => {
		let resolvedValue = value;
		
		// Resolve project variables
		if (projectVars) {
			resolvedValue = resolvedValue.replace(/\$\{\{project\.(.*?)\}\}/g, (_, ref) => {
				if (projectVars[ref] !== undefined) {
					return projectVars[ref];
				}
				throw new Error(`Invalid project environment variable: project.${ref}`);
			});
		}

		// Resolve service link variables
		if (serviceId && serviceType) {
			resolvedValue = resolvedValue.replace(/\$\{\{service\.(.*?)\.(.*?)\}\}/g, (match, targetService, attribute) => {
				// For now, return the original template - this will be resolved at deployment time
				// In a future implementation, we could resolve this synchronously if needed
				return match;
			});
		}

		return `${key}=${resolvedValue}`;
	});

	return resolvedVars;
};

// Enhanced version that resolves service links during deployment
export const prepareEnvironmentVariablesWithServiceLinks = async (
	serviceEnv: string | null,
	projectEnv: string | null,
	serviceId: string,
	serviceType: string,
	previewDeploymentId?: string,
): Promise<string[]> => {
	const projectVars = parse(projectEnv ?? "");
	const serviceVars = parse(serviceEnv ?? "");

	// Import here to avoid circular dependencies
	const { db } = await import("@dokploy/server/db");
	const { serviceLinks, serviceLinkAttributes, previewDeployments, domains } = await import("@dokploy/server/db/schema");
	const { resolveServiceAttribute, getLinkedServices } = await import("../service-links");
	const { eq, and, inArray } = await import("drizzle-orm");

	let previewContext: { appName: string; domain?: string } | undefined;

	// If this is a preview deployment, get the preview context
	if (previewDeploymentId) {
		const [previewDeployment] = await db
			.select()
			.from(previewDeployments)
			.where(eq(previewDeployments.previewDeploymentId, previewDeploymentId))
			.limit(1);

		if (previewDeployment) {
			previewContext = { appName: previewDeployment.appName };
			
			// Get the preview domain
			if (previewDeployment.domainId) {
				const [domain] = await db
					.select()
					.from(domains)
					.where(eq(domains.domainId, previewDeployment.domainId))
					.limit(1);
				if (domain) {
					previewContext.domain = domain.host;
				}
			}
		}
	}

	// Get all service links for this service and linked services (bi-directional)
	const { allLinks } = await getLinkedServices(serviceId, serviceType);

	// Get all attributes for the service links
	const serviceLinkIds = allLinks.map(link => link.serviceLinkId);
	const linkAttributes = serviceLinkIds.length > 0 ? await db
		.select()
		.from(serviceLinkAttributes)
		.where(inArray(serviceLinkAttributes.serviceLinkId, serviceLinkIds)) : [];

	// Create a map of link attributes by service link ID
	const attributesByLinkId = linkAttributes.reduce((acc, attr) => {
		if (!acc[attr.serviceLinkId]) {
			acc[attr.serviceLinkId] = [];
		}
		acc[attr.serviceLinkId]!.push(attr);
		return acc;
	}, {} as Record<string, typeof linkAttributes>);

	// Create a map of service link environment variables
	const serviceLinkVars: Record<string, string> = {};
	
	// Process outgoing links (this service depends on others)
	for (const link of allLinks.filter(l => l.sourceServiceId === serviceId && l.sourceServiceType === serviceType)) {
		const attributes = attributesByLinkId[link.serviceLinkId] || [];
		
		for (const attribute of attributes) {
			let resolvedValue: string | null;
			
			// If in preview deployment, try to find preview deployment for target service
			if (previewDeploymentId) {
				// Look for preview deployment of the target service with same pull request ID
				const [sourcePreview] = await db
					.select()
					.from(previewDeployments)
					.where(eq(previewDeployments.previewDeploymentId, previewDeploymentId))
					.limit(1);

				if (sourcePreview) {
					const [targetPreview] = await db
						.select()
						.from(previewDeployments)
						.where(
							and(
								eq(previewDeployments.pullRequestId, sourcePreview.pullRequestId),
								serviceType === "application" 
									? eq(previewDeployments.applicationId, link.targetServiceId)
									: eq(previewDeployments.applicationId, link.targetServiceId) // TODO: Support other service types
							)
						)
						.limit(1);

					if (targetPreview) {
						// Use target preview context for resolution
						const targetPreviewContext: { appName: string; domain?: string } = { appName: targetPreview.appName };
						if (targetPreview.domainId) {
							const [targetDomain] = await db
								.select()
								.from(domains)
								.where(eq(domains.domainId, targetPreview.domainId))
								.limit(1);
							if (targetDomain) {
								targetPreviewContext.domain = targetDomain.host;
							}
						}
						resolvedValue = await resolveServiceAttribute(
							link.targetServiceId,
							link.targetServiceType,
							attribute.attribute,
							targetPreviewContext
						);
					} else {
						// Fallback to regular resolution
						resolvedValue = await resolveServiceAttribute(
							link.targetServiceId,
							link.targetServiceType,
							attribute.attribute
						);
					}
				} else {
					resolvedValue = await resolveServiceAttribute(
						link.targetServiceId,
						link.targetServiceType,
						attribute.attribute
					);
				}
			} else {
				resolvedValue = await resolveServiceAttribute(
					link.targetServiceId,
					link.targetServiceType,
					attribute.attribute
				);
			}
			
			if (resolvedValue) {
				serviceLinkVars[attribute.envVariableName] = resolvedValue;
			}
		}
	}

	// Process incoming links (other services depend on this service - for bi-directional injection)
	for (const link of allLinks.filter(l => l.targetServiceId === serviceId && l.targetServiceType === serviceType)) {
		const attributes = attributesByLinkId[link.serviceLinkId] || [];
		
		for (const attribute of attributes) {
			// Generate reverse environment variable name (e.g., if link is BACKEND_URL, create FRONTEND_URL)
			const reverseEnvName = `${attribute.envVariableName.replace(/_URL$|_HOST$|_PORT$/, '')}_REVERSE_${attribute.attribute.toUpperCase()}`;
			
			let resolvedValue: string | null;
			
			// Resolve the source service (the one that links to us) 
			if (previewDeploymentId) {
				const [sourcePreview] = await db
					.select()
					.from(previewDeployments)
					.where(eq(previewDeployments.previewDeploymentId, previewDeploymentId))
					.limit(1);

				if (sourcePreview) {
					const [linkedSourcePreview] = await db
						.select()
						.from(previewDeployments)
						.where(
							and(
								eq(previewDeployments.pullRequestId, sourcePreview.pullRequestId),
								serviceType === "application" 
									? eq(previewDeployments.applicationId, link.sourceServiceId)
									: eq(previewDeployments.applicationId, link.sourceServiceId) // TODO: Support other service types
							)
						)
						.limit(1);

					if (linkedSourcePreview) {
						const sourcePreviewContext: { appName: string; domain?: string } = { appName: linkedSourcePreview.appName };
						if (linkedSourcePreview.domainId) {
							const [sourceDomain] = await db
								.select()
								.from(domains)
								.where(eq(domains.domainId, linkedSourcePreview.domainId))
								.limit(1);
							if (sourceDomain) {
								sourcePreviewContext.domain = sourceDomain.host;
							}
						}
						resolvedValue = await resolveServiceAttribute(
							link.sourceServiceId,
							link.sourceServiceType,
							attribute.attribute,
							sourcePreviewContext
						);
					} else {
						resolvedValue = await resolveServiceAttribute(
							link.sourceServiceId,
							link.sourceServiceType,
							attribute.attribute
						);
					}
				} else {
					resolvedValue = await resolveServiceAttribute(
						link.sourceServiceId,
						link.sourceServiceType,
						attribute.attribute
					);
				}
			} else {
				resolvedValue = await resolveServiceAttribute(
					link.sourceServiceId,
					link.sourceServiceType,
					attribute.attribute
				);
			}
			
			if (resolvedValue) {
				serviceLinkVars[reverseEnvName] = resolvedValue;
			}
		}
	}

	// Merge all environment variables
	const allVars = { ...projectVars, ...serviceLinkVars, ...serviceVars };

	const resolvedVars = Object.entries(allVars).map(([key, value]) => {
		let resolvedValue = value;
		
		// Resolve project variables
		resolvedValue = resolvedValue.replace(/\$\{\{project\.(.*?)\}\}/g, (_, ref) => {
			if (allVars[ref] !== undefined) {
				return allVars[ref];
			}
			throw new Error(`Invalid project environment variable: project.${ref}`);
		});

		// Resolve service link variables - these should already be resolved above, 
		// but we handle the template syntax just in case
		resolvedValue = resolvedValue.replace(/\$\{\{service\.(.*?)\.(.*?)\}\}/g, (match, targetService, attribute): string => {
			// Look for a matching service link
			const matchingLink = allLinks.find(link => {
				// Match by appName or service name - we'll need to get the service details
				// For now, just match by targetServiceId since we don't have the service details
				return link.attribute === attribute;
			});
			
			if (matchingLink && serviceLinkVars[matchingLink.envVariableName]) {
				return serviceLinkVars[matchingLink.envVariableName] || match;
			}
			
			// If no match found, throw an error
			throw new Error(`Invalid service link: service.${targetService}.${attribute}`);
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
) => {
	const envs = prepareEnvironmentVariables(input, projectEnv);

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

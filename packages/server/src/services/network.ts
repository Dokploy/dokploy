import { db } from "@dokploy/server/db";
import {
	type apiCreateNetwork,
	applications,
	compose,
	mariadb,
	mongo,
	mysql,
	networks,
	postgres,
	redis,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
	createDockerNetwork,
	type DockerNetworkConfig,
	dockerNetworkExists,
	ensureTraefikConnectedToNetwork,
	ensureTraefikDisconnectedFromNetwork,
	inspectDockerNetwork,
	listDockerNetworks,
	removeDockerNetwork,
} from "../utils/docker/network-utils";

export type DokployNetwork = typeof networks.$inferSelect;

export type ResourceType =
	| "application"
	| "compose"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis";

interface ResourceWithNetworks {
	customNetworkIds?: readonly string[] | null;
	composeType?: string;
	serverId?: string | null;
	server?: {
		name: string;
		serverId: string;
	} | null;
}

type NetworkImportError = {
	networkName: string;
	error: string;
};

type NetworkSyncResult = {
	missing: string[];
	orphaned: string[];
};

type NetworkImportResult = {
	imported: DokployNetwork[];
	errors: NetworkImportError[];
};

const RESOURCE_TABLE_MAP = {
	application: applications,
	compose: compose,
	postgres: postgres,
	mysql: mysql,
	mariadb: mariadb,
	mongo: mongo,
	redis: redis,
} as const;

const RESOURCE_QUERIES = {
	application: (id: string) =>
		db.query.applications.findFirst({
			where: eq(applications.applicationId, id),
			with: { server: true },
		}),
	compose: (id: string) =>
		db.query.compose.findFirst({
			where: eq(compose.composeId, id),
			with: { server: true },
		}),
	postgres: (id: string) =>
		db.query.postgres.findFirst({
			where: eq(postgres.postgresId, id),
			with: { server: true },
		}),
	mysql: (id: string) =>
		db.query.mysql.findFirst({
			where: eq(mysql.mysqlId, id),
			with: { server: true },
		}),
	mariadb: (id: string) =>
		db.query.mariadb.findFirst({
			where: eq(mariadb.mariadbId, id),
			with: { server: true },
		}),
	mongo: (id: string) =>
		db.query.mongo.findFirst({
			where: eq(mongo.mongoId, id),
			with: { server: true },
		}),
	redis: (id: string) =>
		db.query.redis.findFirst({
			where: eq(redis.redisId, id),
			with: { server: true },
		}),
} as const;

export const findResourceById = async (
	resourceId: string,
	resourceType: ResourceType,
): Promise<ResourceWithNetworks> => {
	const resource = await RESOURCE_QUERIES[resourceType](resourceId);

	if (!resource) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `${resourceType} not found`,
		});
	}

	return resource as ResourceWithNetworks;
};

export const createNetwork = async (
	input: typeof apiCreateNetwork._type,
): Promise<DokployNetwork> => {
	if (!input.organizationId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Organization ID is required",
		});
	}

	try {
		const existing = await db.query.networks.findFirst({
			where: and(
				eq(networks.organizationId, input.organizationId),
				eq(networks.networkName, input.networkName),
			),
		});

		if (existing) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `Network with name '${input.networkName}' already exists in this organization`,
			});
		}

		const dockerExists = await dockerNetworkExists(
			input.networkName,
			input.serverId,
		);

		if (dockerExists) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `Docker network '${input.networkName}' already exists on this server`,
			});
		}

		const networkConfig: DockerNetworkConfig = {
			Name: input.networkName,
			Driver: input.driver || "bridge",
			CheckDuplicate: true,
			Attachable: true,
			Internal: input.internal,
			Labels: {
				"com.dokploy.organization.id": input.organizationId,
				"com.dokploy.network.name": input.name,
				...(input.projectId && { "com.dokploy.project.id": input.projectId }),
			},
			...(input.encrypted &&
				input.driver === "overlay" && {
					Options: { encrypted: "" },
				}),
		};

		if (input.subnet || input.gateway || input.ipRange) {
			networkConfig.IPAM = {
				Config: [
					{
						Subnet: input.subnet || undefined,
						Gateway: input.gateway || undefined,
						IPRange: input.ipRange || undefined,
					},
				],
			};
		}

		try {
			await createDockerNetwork(networkConfig, input.serverId);
		} catch (dockerError) {
			const errorMessage =
				dockerError instanceof Error
					? dockerError.message
					: String(dockerError);
			console.error("Error creating Docker network:", dockerError);

			if (
				errorMessage.includes("Pool overlaps") ||
				errorMessage.includes("pool overlaps")
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `The subnet range ${input.subnet || "provided"} overlaps with an existing Docker network. Please choose a different subnet or leave empty for automatic allocation.`,
				});
			}

			if (errorMessage.includes("already exists")) {
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"A Docker network with this configuration already exists. Please use a different network name or check existing networks.",
				});
			}

			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to create Docker network: ${errorMessage}`,
				cause: dockerError,
			});
		}

		const dockerNetworkInspect = await inspectDockerNetwork(
			input.networkName,
			input.serverId,
		);

		const newNetwork = await db
			.insert(networks)
			.values({
				name: input.name,
				description: input.description,
				networkName: input.networkName,
				driver: input.driver || "bridge",
				subnet: input.subnet,
				gateway: input.gateway,
				ipRange: input.ipRange,
				internal: input.internal ?? false,
				encrypted: input.encrypted ?? false,
				organizationId: input.organizationId,
				projectId: input.projectId,
				serverId: input.serverId,
				dockerNetworkId: dockerNetworkInspect.Id,
			})
			.returning()
			.then((value) => value[0]);

		if (!newNetwork) {
			await removeDockerNetwork(input.networkName, input.serverId);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to create network record",
			});
		}

		return newNetwork;
	} catch (error) {
		console.error("Error creating network:", error);
		if (error instanceof TRPCError) {
			throw error;
		}
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message:
				error instanceof Error
					? error.message
					: "Unknown error occurred while creating network",
			cause: error,
		});
	}
};

export const findNetworkById = async (networkId: string) => {
	const network = await db.query.networks.findFirst({
		where: eq(networks.networkId, networkId),
		with: {
			project: true,
			server: true,
		},
	});

	if (!network) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Network not found",
		});
	}

	return network;
};

export const findNetworksByProjectId = async (projectId: string) => {
	return await db.query.networks.findMany({
		where: eq(networks.projectId, projectId),
		with: {
			server: true,
		},
		orderBy: desc(networks.createdAt),
	});
};

export const findNetworksByOrganizationId = async (organizationId: string) => {
	return await db.query.networks.findMany({
		where: eq(networks.organizationId, organizationId),
		with: {
			server: true,
			project: true,
		},
		orderBy: desc(networks.createdAt),
	});
};

export const findNetworksByOrganizationIdAndServerId = async (
	organizationId: string,
	serverId: string | null,
) => {
	const whereConditions = [eq(networks.organizationId, organizationId)];

	if (serverId) {
		whereConditions.push(eq(networks.serverId, serverId));
	} else {
		whereConditions.push(isNull(networks.serverId));
	}

	return await db.query.networks.findMany({
		where: and(...whereConditions),
		with: {
			server: true,
			project: true,
		},
		orderBy: desc(networks.createdAt),
	});
};

export const updateNetwork = async (
	networkId: string,
	data: Partial<DokployNetwork>,
): Promise<DokployNetwork> => {
	await findNetworkById(networkId);

	const updated = await db
		.update(networks)
		.set({
			...data,
			networkId,
		})
		.where(eq(networks.networkId, networkId))
		.returning()
		.then((res) => res[0]);

	if (!updated) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to update network",
		});
	}

	return updated;
};

const isNetworkInUse = async (networkId: string): Promise<boolean> => {
	const [
		allApps,
		allCompose,
		allPostgres,
		allMysql,
		allMariadb,
		allMongo,
		allRedis,
	] = await Promise.all([
		db.query.applications.findMany(),
		db.query.compose.findMany(),
		db.query.postgres.findMany(),
		db.query.mysql.findMany(),
		db.query.mariadb.findMany(),
		db.query.mongo.findMany(),
		db.query.redis.findMany(),
	]);

	const hasNetwork = <
		T extends { customNetworkIds?: readonly string[] | null },
	>(
		resources: T[],
	): boolean =>
		resources.some((resource) => {
			const networkIds = Array.from(resource.customNetworkIds || []);
			return networkIds.includes(networkId);
		});

	const dbUsage =
		hasNetwork(allApps) ||
		hasNetwork(allCompose) ||
		hasNetwork(allPostgres) ||
		hasNetwork(allMysql) ||
		hasNetwork(allMariadb) ||
		hasNetwork(allMongo) ||
		hasNetwork(allRedis);

	if (dbUsage) {
		return true;
	}

	// Check if Docker network has any containers connected
	try {
		const network = await findNetworkById(networkId);
		const networkInspect = await inspectDockerNetwork(
			network.networkName,
			network.serverId,
		);

		const containers = networkInspect.Containers || {};
		const hasConnectedContainers = Object.keys(containers).length > 0;

		return hasConnectedContainers;
	} catch (error) {
		console.warn("Failed to inspect Docker network for usage check:", error);
		return false;
	}
};

export const deleteNetwork = async (
	networkId: string,
): Promise<DokployNetwork> => {
	const network = await findNetworkById(networkId);

	const inUse = await isNetworkInUse(networkId);

	if (inUse) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Cannot delete network that is in use. Please remove it from all resources first.",
		});
	}

	try {
		await removeDockerNetwork(network.networkName, network.serverId);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to remove Docker network: ${errorMessage}. The network may still be in use by containers.`,
		});
	}

	const deleted = await db
		.delete(networks)
		.where(eq(networks.networkId, networkId))
		.returning()
		.then((res) => res[0]);

	if (!deleted) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to delete network record",
		});
	}

	return deleted;
};

const validateNetworkDriverCompatibility = (
	network: DokployNetwork,
	resourceType: ResourceType,
	composeType?: string,
): void => {
	const isSwarmService = resourceType !== "compose";
	const isComposeStack = resourceType === "compose" && composeType === "stack";

	if ((isSwarmService || isComposeStack) && network.driver !== "overlay") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `This ${resourceType} requires an overlay network. Bridge networks are only compatible with Docker Compose services in "docker-compose" mode.`,
		});
	}
};

const validateServerCompatibility = async (
	networkId: string,
	resourceId: string,
	resourceType: ResourceType,
): Promise<void> => {
	const network = await findNetworkById(networkId);
	const resource = await findResourceById(resourceId, resourceType);

	if (network.serverId && resource.serverId !== network.serverId) {
		const networkServerName = network.server?.name || network.serverId;
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Network is on server "${networkServerName}" but this ${resourceType} is on a different server. Both must be on the same server.`,
		});
	}

	if (
		resource.serverId &&
		network.serverId &&
		network.serverId !== resource.serverId
	) {
		const resourceServerName = resource.server?.name || resource.serverId;
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `This ${resourceType} is on server "${resourceServerName}" but the network is on a different server. Both must be on the same server.`,
		});
	}
};

export const assignNetworkToResource = async (
	networkId: string,
	resourceId: string,
	resourceType: ResourceType,
): Promise<{
	success: boolean;
	networkId: string;
	resourceId: string;
	resourceType: ResourceType;
}> => {
	const network = await findNetworkById(networkId);
	const resource = await findResourceById(resourceId, resourceType);

	const currentNetworkIds = Array.from(resource.customNetworkIds || []);

	if (currentNetworkIds.includes(networkId)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Network already assigned to this resource",
		});
	}

	validateNetworkDriverCompatibility(
		network,
		resourceType,
		resource.composeType,
	);

	await validateServerCompatibility(networkId, resourceId, resourceType);

	const updatedNetworkIds = [...currentNetworkIds, networkId];
	const table = RESOURCE_TABLE_MAP[resourceType];
	const idField = `${resourceType}Id` as keyof typeof table.$inferSelect;

	await db
		.update(table)
		.set({ customNetworkIds: updatedNetworkIds })
		.where(eq(table[idField], resourceId));

	return { success: true, networkId, resourceId, resourceType };
};

const isNetworkUsedByResourcesWithDomains = async (
	networkId: string,
): Promise<boolean> => {
	const [allApps, allCompose] = await Promise.all([
		db.query.applications.findMany({ with: { domains: true } }),
		db.query.compose.findMany({ with: { domains: true } }),
	]);

	const hasNetworkWithDomains = <
		T extends {
			customNetworkIds?: readonly string[] | null;
			domains?: unknown[];
		},
	>(
		resources: T[],
	): boolean =>
		resources.some((resource) => {
			const networkIds = Array.from(resource.customNetworkIds || []);
			const hasDomains =
				Array.isArray(resource.domains) && resource.domains.length > 0;
			return networkIds.includes(networkId) && hasDomains;
		});

	return hasNetworkWithDomains(allApps) || hasNetworkWithDomains(allCompose);
};

const disconnectTraefikFromNetworkIfNotUsed = async (
	networkId: string,
	networkName: string,
	serverId?: string | null,
): Promise<boolean> => {
	const stillInUse = await isNetworkUsedByResourcesWithDomains(networkId);

	if (!stillInUse) {
		try {
			await ensureTraefikDisconnectedFromNetwork(networkName, serverId);
			console.log(`Traefik disconnected from network: ${networkName}`);
			return true;
		} catch (error) {
			console.warn(
				`Failed to disconnect Traefik from network ${networkName}:`,
				error,
			);
			return false;
		}
	}

	console.log(
		`Network ${networkName} still in use by resources with domains, keeping Traefik connected`,
	);
	return false;
};

export const removeNetworkFromResource = async (
	networkId: string,
	resourceId: string,
	resourceType: ResourceType,
): Promise<{
	success: boolean;
	networkId: string;
	resourceId: string;
	resourceType: ResourceType;
}> => {
	const network = await findNetworkById(networkId);
	const resource = await findResourceById(resourceId, resourceType);

	const currentNetworkIds = Array.from(resource.customNetworkIds || []);
	const updatedNetworkIds = currentNetworkIds.filter((id) => id !== networkId);

	const table = RESOURCE_TABLE_MAP[resourceType];
	const idField = `${resourceType}Id` as keyof typeof table.$inferSelect;

	await db
		.update(table)
		.set({ customNetworkIds: updatedNetworkIds })
		.where(eq(table[idField], resourceId));

	await disconnectTraefikFromNetworkIfNotUsed(
		networkId,
		network.networkName,
		network.serverId,
	);

	return { success: true, networkId, resourceId, resourceType };
};

export const getResourceNetworks = async (
	resourceId: string,
	resourceType: ResourceType,
) => {
	const resource = await findResourceById(resourceId, resourceType);
	const networkIds = Array.from(resource.customNetworkIds || []);

	if (networkIds.length === 0) {
		return [];
	}

	return await db.query.networks.findMany({
		where: inArray(networks.networkId, networkIds),
	});
};

export const listServerNetworks = async (serverId?: string | null) => {
	return await listDockerNetworks(serverId);
};

/**
 * Sync Dokploy networks with Docker networks
 * This ensures the database is in sync with Docker state
 */
export const syncNetworks = async (
	serverId?: string | null,
): Promise<NetworkSyncResult> => {
	const dockerNetworks = await listDockerNetworks(serverId);
	const dokployNetworks = await db.query.networks.findMany({
		where: serverId ? eq(networks.serverId, serverId) : undefined,
	});

	const synced: NetworkSyncResult = {
		missing: [],
		orphaned: [],
	};

	for (const dokployNetwork of dokployNetworks) {
		const exists = dockerNetworks.some(
			(dn) => dn.Name === dokployNetwork.networkName,
		);
		if (!exists) {
			synced.missing.push(dokployNetwork.networkName);
		}
	}

	for (const dockerNetwork of dockerNetworks) {
		if (dockerNetwork.Labels?.["com.dokploy.organization.id"]) {
			const exists = dokployNetworks.some(
				(dn) => dn.networkName === dockerNetwork.Name,
			);
			if (!exists) {
				synced.orphaned.push(dockerNetwork.Name);
			}
		}
	}

	return synced;
};

/**
 * Import orphaned Docker networks into the database
 * This imports networks that exist in Docker but not in the Dokploy database
 */
export const importOrphanedNetworks = async (
	serverId?: string | null,
): Promise<NetworkImportResult> => {
	const dockerNetworks = await listDockerNetworks(serverId);
	const imported: DokployNetwork[] = [];
	const errors: NetworkImportError[] = [];

	for (const dockerNetwork of dockerNetworks) {
		const orgId = dockerNetwork.Labels?.["com.dokploy.organization.id"];
		if (!orgId) continue;

		const exists = await db.query.networks.findFirst({
			where: and(
				eq(networks.networkName, dockerNetwork.Name),
				serverId ? eq(networks.serverId, serverId) : undefined,
			),
		});

		if (exists) continue;

		try {
			// Verify organization exists
			const organization = await db.query.organization.findFirst({
				where: (organization, { eq }) => eq(organization.id, orgId),
			});

			if (!organization) {
				errors.push({
					networkName: dockerNetwork.Name,
					error: `Organization with ID "${orgId}" does not exist. Network cannot be imported (orphaned network).`,
				});
				continue;
			}

			const projectId =
				dockerNetwork.Labels?.["com.dokploy.project.id"] || null;

			// Verify project exists if projectId is provided
			if (projectId) {
				const project = await db.query.projects.findFirst({
					where: (projects, { eq }) => eq(projects.projectId, projectId),
				});

				if (!project) {
					errors.push({
						networkName: dockerNetwork.Name,
						error: `Project with ID "${projectId}" does not exist. Network cannot be imported (orphaned network).`,
					});
					continue;
				}
			}

			const networkInspect = await inspectDockerNetwork(
				dockerNetwork.Name,
				serverId,
			);

			const ipamConfig = networkInspect.IPAM?.Config?.[0];
			const displayName =
				dockerNetwork.Labels?.["com.dokploy.network.name"] ||
				dockerNetwork.Name;
			const driverType =
				dockerNetwork.Driver === "overlay" ? "overlay" : "bridge";

			const [importedNetwork] = await db
				.insert(networks)
				.values({
					name: displayName,
					networkName: dockerNetwork.Name,
					description: `Imported from Docker on ${new Date().toISOString()}`,
					driver: driverType,
					dockerNetworkId: dockerNetwork.Id,
					organizationId: orgId,
					projectId,
					serverId,
					internal: networkInspect.Internal ?? false,
					encrypted: false,
					subnet: ipamConfig?.Subnet || null,
					gateway: ipamConfig?.Gateway || null,
					ipRange: ipamConfig?.IPRange || null,
				})
				.returning();

			if (importedNetwork) {
				imported.push(importedNetwork);
			}
		} catch (error) {
			console.error(`Failed to import network ${dockerNetwork.Name}:`, error);
			errors.push({
				networkName: dockerNetwork.Name,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	return { imported, errors };
};

/**
 * Connect Traefik to all custom networks assigned to a resource
 * This is called when a domain is added to a resource to ensure Traefik can route traffic
 */
export const connectTraefikToResourceNetworks = async (
	resourceId: string,
	resourceType: ResourceType,
	serverId?: string | null,
): Promise<void> => {
	try {
		const resource = await findResourceById(resourceId, resourceType);
		const customNetworkIds = Array.from(resource.customNetworkIds || []);

		if (customNetworkIds.length === 0) {
			console.log(
				`No custom networks for ${resourceType} ${resourceId}, skipping Traefik connection`,
			);
			return;
		}

		const customNetworks = await db.query.networks.findMany({
			where: inArray(networks.networkId, customNetworkIds),
		});

		if (customNetworks.length === 0) {
			console.warn(
				`Custom networks not found in DB for ${resourceType} ${resourceId}`,
			);
			return;
		}

		console.log(
			`Connecting Traefik to ${customNetworks.length} networks for ${resourceType} ${resourceId}`,
		);

		const results = await Promise.allSettled(
			customNetworks.map((network) =>
				ensureTraefikConnectedToNetwork(network.networkName, serverId),
			),
		);

		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			const networkName = customNetworks[i]?.networkName;

			if (!result) continue;

			if (result.status === "fulfilled") {
				console.log(`Traefik connected to network: ${networkName}`);
			} else {
				console.warn(
					`Failed to connect Traefik to network ${networkName}:`,
					"reason" in result ? result.reason : "Unknown error",
				);
			}
		}
	} catch (error) {
		console.error(
			`Error connecting Traefik to networks for ${resourceType} ${resourceId}:`,
			error,
		);
	}
};

/**
 * Disconnect Traefik from resource networks if they are no longer used by resources with domains
 * This is called when a domain is deleted from a resource
 */
export const disconnectTraefikFromResourceNetworks = async (
	resourceId: string,
	resourceType: ResourceType,
	serverId?: string | null,
): Promise<void> => {
	try {
		const resource = await findResourceById(resourceId, resourceType);
		const customNetworkIds = Array.from(resource.customNetworkIds || []);

		if (customNetworkIds.length === 0) {
			console.log(
				`No custom networks for ${resourceType} ${resourceId}, skipping Traefik disconnection`,
			);
			return;
		}

		const customNetworks = await db.query.networks.findMany({
			where: inArray(networks.networkId, customNetworkIds),
		});

		if (customNetworks.length === 0) {
			console.warn(
				`Custom networks not found in DB for ${resourceType} ${resourceId}`,
			);
			return;
		}

		console.log(
			`Checking if Traefik should disconnect from ${customNetworks.length} networks for ${resourceType} ${resourceId}`,
		);

		for (const network of customNetworks) {
			await disconnectTraefikFromNetworkIfNotUsed(
				network.networkId,
				network.networkName,
				serverId,
			);
		}
	} catch (error) {
		console.error(
			`Error disconnecting Traefik from networks for ${resourceType} ${resourceId}:`,
			error,
		);
	}
};

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
import { and, desc, eq, inArray } from "drizzle-orm";
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

type ResourceType =
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
		}),
	compose: (id: string) =>
		db.query.compose.findFirst({
			where: eq(compose.composeId, id),
		}),
	postgres: (id: string) =>
		db.query.postgres.findFirst({
			where: eq(postgres.postgresId, id),
		}),
	mysql: (id: string) =>
		db.query.mysql.findFirst({
			where: eq(mysql.mysqlId, id),
		}),
	mariadb: (id: string) =>
		db.query.mariadb.findFirst({
			where: eq(mariadb.mariadbId, id),
		}),
	mongo: (id: string) =>
		db.query.mongo.findFirst({
			where: eq(mongo.mongoId, id),
		}),
	redis: (id: string) =>
		db.query.redis.findFirst({
			where: eq(redis.redisId, id),
		}),
} as const;

const findResourceById = async (
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

const unsetDefaultNetworkForOrganization = async (
	organizationId: string,
): Promise<void> => {
	await db
		.update(networks)
		.set({ isDefault: false })
		.where(
			and(eq(networks.organizationId, organizationId), eq(networks.isDefault, true)),
		);
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
			Attachable: input.attachable,
			Internal: input.internal,
			Labels: {
				"com.dokploy.organization.id": input.organizationId,
				"com.dokploy.network.name": input.name,
				...(input.projectId && { "com.dokploy.project.id": input.projectId }),
			},
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

		await createDockerNetwork(networkConfig, input.serverId);
		const dockerNetworkInspect = await inspectDockerNetwork(
			input.networkName,
			input.serverId,
		);

		if (input.isDefault) {
			await unsetDefaultNetworkForOrganization(input.organizationId);
		}

		const newNetwork = await db
			.insert(networks)
			.values({
				name: input.name,
				description: input.description,
				networkName: input.networkName,
				driver: input.driver || "bridge",
				isDefault: input.isDefault || false,
				subnet: input.subnet,
				gateway: input.gateway,
				ipRange: input.ipRange,
				attachable: input.attachable ?? true,
				internal: input.internal ?? false,
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
		throw error;
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

export const updateNetwork = async (
	networkId: string,
	data: Partial<DokployNetwork>,
): Promise<DokployNetwork> => {
	const network = await findNetworkById(networkId);

	if (data.isDefault) {
		await unsetDefaultNetworkForOrganization(network.organizationId);
	}

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
	const usageChecks = await Promise.all([
		db.query.applications.findFirst({
			where: eq(applications.customNetworkIds, [networkId]),
		}),
		db.query.compose.findFirst({
			where: eq(compose.customNetworkIds, [networkId]),
		}),
		db.query.postgres.findFirst({
			where: eq(postgres.customNetworkIds, [networkId]),
		}),
		db.query.mysql.findFirst({
			where: eq(mysql.customNetworkIds, [networkId]),
		}),
		db.query.mariadb.findFirst({
			where: eq(mariadb.customNetworkIds, [networkId]),
		}),
		db.query.mongo.findFirst({
			where: eq(mongo.customNetworkIds, [networkId]),
		}),
		db.query.redis.findFirst({
			where: eq(redis.customNetworkIds, [networkId]),
		}),
	]);

	return usageChecks.some((check) => check !== undefined);
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
		console.warn("Failed to remove Docker network, continuing:", error);
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

export const assignNetworkToResource = async (
	networkId: string,
	resourceId: string,
	resourceType: ResourceType,
): Promise<{ success: boolean; networkId: string; resourceId: string; resourceType: ResourceType }> => {
	const network = await findNetworkById(networkId);
	const resource = await findResourceById(resourceId, resourceType);

	const currentNetworkIds = Array.from(resource.customNetworkIds || []);

	if (currentNetworkIds.includes(networkId)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Network already assigned to this resource",
		});
	}

	validateNetworkDriverCompatibility(network, resourceType, resource.composeType);

	const updatedNetworkIds = [...currentNetworkIds, networkId];
	const table = RESOURCE_TABLE_MAP[resourceType];
	const idField = `${resourceType}Id` as keyof typeof table.$inferSelect;

	await db
		.update(table)
		.set({ customNetworkIds: updatedNetworkIds })
		.where(eq(table[idField], resourceId));

	try {
		await ensureTraefikConnectedToNetwork(network.networkName, network.serverId);
	} catch (error) {
		console.warn(
			`Failed to connect Traefik to network ${network.networkName}:`,
			error,
		);
	}

	return { success: true, networkId, resourceId, resourceType };
};

const isNetworkUsedByResourcesWithDomains = async (
	networkId: string,
): Promise<boolean> => {
	const [allApps, allCompose] = await Promise.all([
		db.query.applications.findMany({ with: { domains: true } }),
		db.query.compose.findMany({ with: { domains: true } }),
	]);

	const hasNetworkWithDomains = <T extends { customNetworkIds?: readonly string[] | null; domains?: unknown[] }>(
		resources: T[]
	): boolean =>
		resources.some((resource) => {
			const networkIds = Array.from(resource.customNetworkIds || []);
			const hasDomains = Array.isArray(resource.domains) && resource.domains.length > 0;
			return networkIds.includes(networkId) && hasDomains;
		});

	return hasNetworkWithDomains(allApps) || hasNetworkWithDomains(allCompose);
};

export const removeNetworkFromResource = async (
	networkId: string,
	resourceId: string,
	resourceType: ResourceType,
): Promise<{ success: boolean; networkId: string; resourceId: string; resourceType: ResourceType }> => {
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

	const stillInUse = await isNetworkUsedByResourcesWithDomains(networkId);

	if (!stillInUse) {
		try {
			await ensureTraefikDisconnectedFromNetwork(
				network.networkName,
				network.serverId,
			);
		} catch (error) {
			console.warn(
				`Failed to disconnect Traefik from network ${network.networkName}:`,
				error,
			);
		}
	}

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
			const networkInspect = await inspectDockerNetwork(
				dockerNetwork.Name,
				serverId,
			);

			const ipamConfig = networkInspect.IPAM?.Config?.[0];
			const projectId = dockerNetwork.Labels?.["com.dokploy.project.id"] || null;
			const displayName =
				dockerNetwork.Labels?.["com.dokploy.network.name"] || dockerNetwork.Name;
			const driverType = dockerNetwork.Driver === "overlay" ? "overlay" : "bridge";

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
					isDefault: false,
					attachable: networkInspect.Attachable ?? true,
					internal: networkInspect.Internal ?? false,
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
 * Helper function to import an existing Docker network into the database
 * Used during migration when a Docker network exists but not in the database
 */
const importExistingDockerNetwork = async (
	networkName: string,
	organizationId: string,
	projectId?: string,
	serverId?: string | null,
): Promise<DokployNetwork> => {
	console.log(
		`Importing existing Docker network '${networkName}' into database`,
	);

	const dockerInspect = await inspectDockerNetwork(networkName, serverId);
	const driver = dockerInspect.Driver === "overlay" ? "overlay" : "bridge";
	const ipamConfig = dockerInspect.IPAM?.Config?.[0];

	const [imported] = await db
		.insert(networks)
		.values({
			name: `Imported Isolated Network (${networkName})`,
			networkName,
			description: "Imported existing Docker network during migration",
			driver,
			dockerNetworkId: dockerInspect.Id,
			organizationId,
			projectId,
			serverId,
			isDefault: false,
			attachable: dockerInspect.Attachable ?? true,
			internal: dockerInspect.Internal ?? false,
			subnet: ipamConfig?.Subnet || null,
			gateway: ipamConfig?.Gateway || null,
			ipRange: ipamConfig?.IPRange || null,
		})
		.returning();

	if (!imported) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to import Docker network '${networkName}' into database`,
		});
	}

	console.log(
		`Successfully imported network '${networkName}' with ID ${imported.networkId}`,
	);
	return imported;
};

/**
 * Find or create an isolated network for a compose service
 * This is used for the isolatedDeployment feature and migration 118
 *
 * TEMPORARY FUNCTION: Will be removed after migration 118 is complete
 */
export const findOrCreateIsolatedNetwork = async ({
	organizationId,
	projectId,
	appName,
	serverId = null,
}: {
	organizationId: string;
	projectId?: string;
	appName: string;
	serverId?: string | null;
}): Promise<DokployNetwork> => {
	const existing = await db.query.networks.findFirst({
		where: and(
			eq(networks.organizationId, organizationId),
			eq(networks.networkName, appName),
		),
	});

	if (existing) {
		console.log(`Found existing network in DB: ${appName} (${existing.networkId})`);
		return existing;
	}

	const dockerExists = await dockerNetworkExists(appName, serverId);

	if (dockerExists) {
		console.log(`Found orphaned Docker network '${appName}', importing...`);
		return await importExistingDockerNetwork(
			appName,
			organizationId,
			projectId,
			serverId,
		);
	}

	console.log(`Creating new isolated network: ${appName}`);
	const driver = serverId ? "overlay" : "bridge";

	const [network] = await db
		.insert(networks)
		.values({
			name: `Isolated Network (${appName})`,
			networkName: appName,
			description: `Auto-generated isolated network for ${appName}`,
			driver,
			organizationId,
			projectId,
			serverId,
			isDefault: false,
			attachable: true,
			internal: false,
		})
		.returning();

	if (!network) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to create isolated network in database",
		});
	}

	try {
		const dockerConfig: DockerNetworkConfig = {
			Name: appName,
			Driver: driver,
			Attachable: true,
			Internal: false,
			Labels: {
				"com.dokploy.network.id": network.networkId,
				"com.dokploy.organization.id": organizationId,
				"com.dokploy.isolated": "true",
				...(projectId && { "com.dokploy.project.id": projectId }),
			},
		};

		await createDockerNetwork(dockerConfig, serverId);
		const dockerNetworkInspect = await inspectDockerNetwork(appName, serverId);

		const [updatedNetwork] = await db
			.update(networks)
			.set({ dockerNetworkId: dockerNetworkInspect.Id })
			.where(eq(networks.networkId, network.networkId))
			.returning();

		console.log(`Successfully created network '${appName}' (${network.networkId})`);
		return updatedNetwork || network;
	} catch (error) {
		console.error(
			`Failed to create Docker network '${appName}', rolling back DB entry:`,
			error,
		);

		await db.delete(networks).where(eq(networks.networkId, network.networkId));

		if (error instanceof Error && error.message?.includes("already exists")) {
			console.log(
				`Docker network '${appName}' was created between checks, importing...`,
			);
			return await importExistingDockerNetwork(
				appName,
				organizationId,
				projectId,
				serverId,
			);
		}

		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to create Docker network '${appName}': ${error instanceof Error ? error.message : "Unknown error"}`,
		});
	}
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

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
	customNetworkIds?: string[] | null;
	composeType?: string;
}

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

/**
 * Create a new custom network
 */
export const createNetwork = async (input: typeof apiCreateNetwork._type) => {
	// Validate required fields
	if (!input.organizationId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Organization ID is required",
		});
	}

	try {
		// Check if network name already exists for this organization
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

		// Check if Docker network with this name exists
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

		// Build Docker network configuration
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

		// Add IPAM configuration if provided
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

		// Create Docker network
		await createDockerNetwork(networkConfig, input.serverId);
		const dockerNetworkInspect = await inspectDockerNetwork(
			input.networkName,
			input.serverId,
		);

		// If this should be the default network, unset other defaults
		if (input.isDefault) {
			await db
				.update(networks)
				.set({ isDefault: false })
				.where(
					and(
						eq(networks.organizationId, input.organizationId),
						eq(networks.isDefault, true),
					),
				);
		}

		// Create network record in database
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
			.then((value: DokployNetwork[]) => value[0]);

		if (!newNetwork) {
			// Rollback: Remove Docker network if DB insert fails
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

/**
 * Get a network by ID
 */
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

/**
 * Get all networks for a project
 */
export const findNetworksByProjectId = async (projectId: string) => {
	return await db.query.networks.findMany({
		where: eq(networks.projectId, projectId),
		with: {
			server: true,
		},
		orderBy: desc(networks.createdAt),
	});
};

/**
 * Get all networks for an organization
 */
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

/**
 * Update a network
 */
export const updateNetwork = async (
	networkId: string,
	data: Partial<DokployNetwork>,
) => {
	const network = await findNetworkById(networkId);

	// If setting as default, unset other defaults in organization
	if (data.isDefault) {
		await db
			.update(networks)
			.set({ isDefault: false })
			.where(
				and(
					eq(networks.organizationId, network.organizationId),
					eq(networks.isDefault, true),
				),
			);
	}

	const updated = await db
		.update(networks)
		.set({
			...data,
			networkId,
		})
		.where(eq(networks.networkId, networkId))
		.returning()
		.then((res: DokployNetwork[]) => res[0]);

	return updated;
};

/**
 * Delete a network
 */
export const deleteNetwork = async (networkId: string) => {
	const network = await findNetworkById(networkId);

	// Check if network is being used by any resources
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

	const inUse = usageChecks.some((check: any) => check !== undefined);

	if (inUse) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Cannot delete network that is in use. Please remove it from all resources first.",
		});
	}

	// Remove Docker network
	try {
		await removeDockerNetwork(network.networkName, network.serverId);
	} catch (error) {
		console.warn("Failed to remove Docker network, continuing:", error);
		// Continue with database deletion even if Docker removal fails
	}

	// Delete network record
	const deleted = await db
		.delete(networks)
		.where(eq(networks.networkId, networkId))
		.returning()
		.then((res: DokployNetwork[]) => res[0]);

	return deleted;
};

/**
 * Assign a network to a resource (application, compose, database)
 */
export const assignNetworkToResource = async (
	networkId: string,
	resourceId: string,
	resourceType: ResourceType,
) => {
	const network = await findNetworkById(networkId);
	const resource = await findResourceById(resourceId, resourceType);

	const currentNetworkIds = (resource.customNetworkIds || []) as string[];

	// Check if already assigned
	if (currentNetworkIds.includes(networkId)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Network already assigned to this resource",
		});
	}

	// Validate network driver compatibility
	// Swarm services (applications, databases) require overlay networks
	// Compose services depend on composeType: "stack" requires overlay, "docker-compose" allows both
	const isSwarmService = resourceType !== "compose";
	const isComposeStack =
		resourceType === "compose" && resource.composeType === "stack";

	if ((isSwarmService || isComposeStack) && network.driver !== "overlay") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `This ${resourceType} requires an overlay network. Bridge networks are only compatible with Docker Compose services in "docker-compose" mode.`,
		});
	}

	// Add network ID
	const updatedNetworkIds = [...currentNetworkIds, networkId];
	const table = RESOURCE_TABLE_MAP[resourceType];
	const idField = `${resourceType}Id` as keyof typeof table.$inferSelect;

	// Update resource
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
	const allApps = await db.query.applications.findMany({
		with: { domains: true },
	});

	const allCompose = await db.query.compose.findMany({
		with: { domains: true },
	});

	const hasNetworkWithDomains = (resources: typeof allApps | typeof allCompose) =>
		resources.some((resource) => {
			const networkIds = (resource.customNetworkIds || []) as string[];
			const hasDomains = resource.domains && resource.domains.length > 0;
			return networkIds.includes(networkId) && hasDomains;
		});

	return (
		hasNetworkWithDomains(allApps) || hasNetworkWithDomains(allCompose)
	);
};

export const removeNetworkFromResource = async (
	networkId: string,
	resourceId: string,
	resourceType: ResourceType,
) => {
	const network = await findNetworkById(networkId);
	const resource = await findResourceById(resourceId, resourceType);

	const currentNetworkIds = (resource.customNetworkIds || []) as string[];
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

/**
 * Get networks assigned to a resource
 */
export const getResourceNetworks = async (
	resourceId: string,
	resourceType: ResourceType,
) => {
	const resource = await findResourceById(resourceId, resourceType);
	const networkIds = (resource.customNetworkIds || []) as string[];

	if (networkIds.length === 0) {
		return [];
	}

	// Get network details
	const networkDetails = await db.query.networks.findMany({
		where: inArray(networks.networkId, networkIds),
	});

	return networkDetails;
};

/**
 * List all Docker networks on a server
 */
export const listServerNetworks = async (serverId?: string | null) => {
	return await listDockerNetworks(serverId);
};

/**
 * Sync Dokploy networks with Docker networks
 * This ensures the database is in sync with Docker state
 */
export const syncNetworks = async (serverId?: string | null) => {
	const dockerNetworks = await listDockerNetworks(serverId);
	const dokployNetworks = await db.query.networks.findMany({
		where: serverId ? eq(networks.serverId, serverId) : undefined,
	});

	const synced = {
		missing: [] as string[],
		orphaned: [] as string[],
	};

	// Check for missing Docker networks
	for (const dokployNetwork of dokployNetworks) {
		const exists = dockerNetworks.some(
			(dn: any) => dn.Name === dokployNetwork.networkName,
		);
		if (!exists) {
			synced.missing.push(dokployNetwork.networkName);
		}
	}

	// Check for orphaned Docker networks (created by Dokploy but not in DB)
	for (const dockerNetwork of dockerNetworks) {
		if (dockerNetwork.Labels?.["com.dokploy.project.id"]) {
			const exists = dokployNetworks.some(
				(dn: any) => dn.networkName === dockerNetwork.Name,
			);
			if (!exists) {
				synced.orphaned.push(dockerNetwork.Name);
			}
		}
	}

	return synced;
};

/**
 * Find or create an isolated network for a compose service
 * This is used for the isolatedDeployment feature
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
	// Try to find existing network with this appName
	const existing = await db.query.networks.findFirst({
		where: and(
			eq(networks.organizationId, organizationId),
			eq(networks.networkName, appName),
		),
	});

	if (existing) {
		return existing;
	}

	// Create new isolated network
	const driver = serverId ? "overlay" : "bridge";

	// Insert into database first to get the networkId
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
		throw new Error("Failed to create isolated network in database");
	}

	// Create network in Docker with the database-generated networkId
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

	// Update the network with the Docker network ID
	const [updatedNetwork] = await db
		.update(networks)
		.set({ dockerNetworkId: dockerNetworkInspect.Id })
		.where(eq(networks.networkId, network.networkId))
		.returning();

	return updatedNetwork || network;
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
		const customNetworkIds = (resource.customNetworkIds || []) as string[];

		if (customNetworkIds.length === 0) {
			console.log(
				`No custom networks for ${resourceType} ${resourceId}, skipping Traefik connection`,
			);
			return;
		}

		// Get network details from DB
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

		// Connect Traefik to each custom network
		const results = await Promise.allSettled(
			customNetworks.map((network) =>
				ensureTraefikConnectedToNetwork(network.networkName, serverId),
			),
		);

		// Log results
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
				// Don't throw - this shouldn't block deployment
			}
		}
	} catch (error) {
		console.error(
			`Error connecting Traefik to networks for ${resourceType} ${resourceId}:`,
			error,
		);
		// Don't throw - network connection failures shouldn't block deployments
	}
};

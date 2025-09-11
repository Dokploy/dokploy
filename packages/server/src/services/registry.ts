import { db } from "@dokploy/server/db";
import { type apiCreateRegistry, registry } from "@dokploy/server/db/schema";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { IS_CLOUD } from "../constants";

export type Registry = typeof registry.$inferSelect;

export const createRegistry = async (
	input: typeof apiCreateRegistry._type,
	organizationId: string,
) => {
	return await db.transaction(async (tx) => {
		const newRegistry = await tx
			.insert(registry)
			.values({
				...input,
				organizationId: organizationId,
			})
			.returning()
			.then((value) => value[0]);

		if (!newRegistry) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input:  Inserting registry",
			});
		}

		if (IS_CLOUD && !input.serverId && input.serverId !== "none") {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Select a server to add the registry",
			});
		}
		const loginCommand = `echo ${input.password} | docker login ${input.registryUrl} --username ${input.username} --password-stdin`;
		if (input.serverId && input.serverId !== "none") {
			await execAsyncRemote(input.serverId, loginCommand);
		} else if (newRegistry.registryType === "cloud") {
			await execAsync(loginCommand);
		}

		return newRegistry;
	});
};

export const removeRegistry = async (registryId: string) => {
	try {
		const response = await db
			.delete(registry)
			.where(eq(registry.registryId, registryId))
			.returning()
			.then((res) => res[0]);

		if (!response) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Registry not found",
			});
		}

		if (!IS_CLOUD) {
			await execAsync(`docker logout ${response.registryUrl}`);
			
			// If it's a self-hosted registry, also remove the Docker service and volumes
			if (response.registryType === "selfHosted") {
				try {
					await execAsync(`docker service rm dokploy-registry`);
					console.log("Self-hosted registry Docker service removed ✅");
					
					// Also remove the associated volumes
					const volumes = ["dokploy-registry-data", "dokploy-registry-auth", "dokploy-registry-certs"];
					for (const volume of volumes) {
						try {
							await execAsync(`docker volume rm ${volume}`);
							console.log(`Volume ${volume} removed ✅`);
						} catch (volumeError) {
							console.warn(`Failed to remove volume ${volume} (may not exist):`, volumeError);
						}
					}
				} catch (serviceError) {
					console.warn("Failed to remove Docker service (may not exist):", serviceError);
				}
			}
		}

		return response;
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error removing this registry",
			cause: error,
		});
	}
};

export const updateRegistry = async (
	registryId: string,
	registryData: Partial<Registry> & { serverId?: string | null },
) => {
	try {
		const response = await db
			.update(registry)
			.set({
				...registryData,
			})
			.where(eq(registry.registryId, registryId))
			.returning()
			.then((res) => res[0]);

		const loginCommand = `echo ${response?.password} | docker login ${response?.registryUrl} --username ${response?.username} --password-stdin`;

		if (
			IS_CLOUD &&
			!registryData?.serverId &&
			registryData?.serverId !== "none"
		) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Select a server to add the registry",
			});
		}

		if (registryData?.serverId && registryData?.serverId !== "none") {
			await execAsyncRemote(registryData.serverId, loginCommand);
		} else if (response?.registryType === "cloud") {
			await execAsync(loginCommand);
		}

		return response;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Error updating this registry";
		throw new TRPCError({
			code: "BAD_REQUEST",
			message,
		});
	}
};

export const findRegistryById = async (registryId: string) => {
	const registryResponse = await db.query.registry.findFirst({
		where: eq(registry.registryId, registryId),
		columns: {
			password: false,
		},
	});
	if (!registryResponse) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Registry not found",
		});
	}
	return registryResponse;
};

export const findAllRegistryByOrganizationId = async (
	organizationId: string,
) => {
	const registryResponse = await db.query.registry.findMany({
		where: eq(registry.organizationId, organizationId),
	});
	return registryResponse;
};

export const createDefaultRegistry = async (organizationId: string) => {
	// Check if a self-hosted registry already exists
	const existingRegistries = await findAllRegistryByOrganizationId(organizationId);
	const hasSelfHostedRegistry = existingRegistries.some(r => r.registryType === "selfHosted");
	
	if (hasSelfHostedRegistry) {
		console.log("Self-hosted registry already exists, skipping default creation");
		return null;
	}

	// Create default self-hosted registry
	const defaultRegistryData = {
		registryName: "Default Self Hosted Registry",
		username: "registry",
		password: "registry123",
		registryUrl: "http://localhost:5001",
		registryType: "selfHosted" as const,
		imagePrefix: "registry.localhost",
		serverId: null,
	};

	return await createRegistry(defaultRegistryData, organizationId);
};

export const ensureDefaultRegistryExists = async (organizationId: string) => {
	try {
		// Check if any registry exists for this organization
		const existingRegistries = await findAllRegistryByOrganizationId(organizationId);
		
		// Only create default registry if no registries exist AND this is a fresh installation
		// This prevents recreation after user deletion
		if (existingRegistries.length === 0) {
			// Check if this is a fresh installation by looking for any other data
			// For now, we'll be conservative and not auto-create here
			console.log("No registries found, but not auto-creating to prevent recreation after deletion");
			return null;
		}
		
		return null;
	} catch (error) {
		console.error("Error ensuring default registry exists:", error);
		return null;
	}
};

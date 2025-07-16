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

export const fetchRegistryImages = async (registryId: string) => {
	const registryResponse = await db.query.registry.findFirst({
		where: eq(registry.registryId, registryId),
	});

	if (!registryResponse) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Registry not found",
		});
	}

	const auth = Buffer.from(
		`${registryResponse.username}:${registryResponse.password}`,
	).toString("base64");

	try {
		const response = await fetch(
			`${registryResponse.registryUrl}/v2/_catalog`,
			{
				headers: {
					Authorization: `Basic ${auth}`,
				},
			},
		);

		if (!response.ok) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Registry API error: ${response.status} ${response.statusText}`,
			});
		}

		const data = await response.json();
		return data.repositories || [];
	} catch (error) {
		console.error("Error fetching registry images:", error);
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to fetch registry images",
			cause: error,
		});
	}
};

export const fetchImageTags = async (registryId: string, imageName: string) => {
	const registryResponse = await db.query.registry.findFirst({
		where: eq(registry.registryId, registryId),
	});

	if (!registryResponse) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Registry not found",
		});
	}

	const auth = Buffer.from(
		`${registryResponse.username}:${registryResponse.password}`,
	).toString("base64");

	try {
		const response = await fetch(
			`${registryResponse.registryUrl}/v2/${imageName}/tags/list`,
			{
				headers: {
					Authorization: `Basic ${auth}`,
				},
			},
		);

		if (!response.ok) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Registry API error: ${response.status} ${response.statusText}`,
			});
		}

		const data = await response.json();
		return data.tags || [];
	} catch (error) {
		console.error("Error fetching image tags:", error);
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to fetch image tags",
			cause: error,
		});
	}
};

export const validateRegistryAccess = async (registryId: string) => {
	const registryResponse = await db.query.registry.findFirst({
		where: eq(registry.registryId, registryId),
	});

	if (!registryResponse) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Registry not found",
		});
	}

	const auth = Buffer.from(
		`${registryResponse.username}:${registryResponse.password}`,
	).toString("base64");

	try {
		const response = await fetch(
			`${registryResponse.registryUrl}/v2/_catalog`,
			{
				headers: {
					Authorization: `Basic ${auth}`,
				},
			},
		);

		return response.ok;
	} catch (error) {
		console.error("Error validating registry access:", error);
		return false;
	}
};

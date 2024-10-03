import { db } from "@/server/db";
import { type apiCreateRegistry, registry } from "@/server/db/schema";
import { initializeRegistry } from "@/server/setup/registry-setup";
import { removeService } from "@/server/utils/docker/utils";
import { execAsync, execAsyncRemote } from "@/server/utils/process/execAsync";
import {
	manageRegistry,
	removeSelfHostedRegistry,
} from "@/server/utils/traefik/registry";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { findAdmin } from "./admin";

export type Registry = typeof registry.$inferSelect;

export const createRegistry = async (input: typeof apiCreateRegistry._type) => {
	const admin = await findAdmin();

	return await db.transaction(async (tx) => {
		const newRegistry = await tx
			.insert(registry)
			.values({
				...input,
				adminId: admin.adminId,
			})
			.returning()
			.then((value) => value[0]);

		if (!newRegistry) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input:  Inserting registry",
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

		if (response.registryType === "selfHosted") {
			await removeSelfHostedRegistry();
			await removeService("dokploy-registry");
		}

		await execAsync(`docker logout ${response.registryUrl}`);

		return response;
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to remove this registry",
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

		if (response?.registryType === "selfHosted") {
			await manageRegistry(response);
			await initializeRegistry(response.username, response.password);
		}
		const loginCommand = `echo ${response?.password} | docker login ${response?.registryUrl} --username ${response?.username} --password-stdin`;

		if (registryData?.serverId && registryData?.serverId !== "none") {
			await execAsyncRemote(registryData.serverId, loginCommand);
		} else if (response?.registryType === "cloud") {
			await execAsync(loginCommand);
		}

		return response;
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to update this registry",
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

export const findAllRegistry = async () => {
	const registryResponse = await db.query.registry.findMany();
	return registryResponse;
};

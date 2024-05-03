import { type apiCreateRegistry, registry } from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { db } from "@/server/db";
import { eq } from "drizzle-orm";

export type Registry = typeof registry.$inferSelect;

export const createRegistry = async (input: typeof apiCreateRegistry._type) => {
	const newRegistry = await db
		.insert(registry)
		.values({
			...input,
		})
		.returning()
		.then((value) => value[0]);

	if (!newRegistry) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input:  Inserting registry",
		});
	}
	return newRegistry;
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

		return response;
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to remove this registry",
			cause: error,
		});
	}
};

export const updaterRegistry = async (
	registryId: string,
	registryData: Partial<Registry>,
) => {
	try {
		const response = await db
			.update(registry)
			.set({
				...registryData,
			})
			.where(eq(registry.registryId, registryId))
			.returning();

		return response[0];
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
	});
	if (!registryResponse) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Registry not found",
		});
	}
	return registryResponse;
};

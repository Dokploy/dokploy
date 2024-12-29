import {
	apiCreateRegistry,
	apiFindOneRegistry,
	apiRemoveRegistry,
	apiTestRegistry,
	apiUpdateRegistry,
} from "@/server/db/schema";
import {
	IS_CLOUD,
	createRegistry,
	execAsync,
	execAsyncRemote,
	findAllRegistryByAdminId,
	findRegistryById,
	removeRegistry,
	updateRegistry,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";

export const registryRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateRegistry)
		.mutation(async ({ ctx, input }) => {
			return await createRegistry(input, ctx.user.adminId);
		}),
	remove: adminProcedure
		.input(apiRemoveRegistry)
		.mutation(async ({ ctx, input }) => {
			const registry = await findRegistryById(input.registryId);
			if (registry.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to delete this registry",
				});
			}
			return await removeRegistry(input.registryId);
		}),
	update: protectedProcedure
		.input(apiUpdateRegistry)
		.mutation(async ({ input, ctx }) => {
			const { registryId, ...rest } = input;
			const registry = await findRegistryById(registryId);
			if (registry.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to update this registry",
				});
			}
			const application = await updateRegistry(registryId, {
				...rest,
			});

			if (!application) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating registry",
				});
			}

			return true;
		}),
	all: protectedProcedure.query(async ({ ctx }) => {
		return await findAllRegistryByAdminId(ctx.user.adminId);
	}),
	one: adminProcedure
		.input(apiFindOneRegistry)
		.query(async ({ input, ctx }) => {
			const registry = await findRegistryById(input.registryId);
			if (registry.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this registry",
				});
			}
			return registry;
		}),
	testRegistry: protectedProcedure
		.input(apiTestRegistry)
		.mutation(async ({ input }) => {
			try {
				const loginCommand = `echo ${input.password} | docker login ${input.registryUrl} --username ${input.username} --password-stdin`;

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Select a server to test the registry",
					});
				}

				if (input.serverId && input.serverId !== "none") {
					await execAsyncRemote(input.serverId, loginCommand);
				} else {
					await execAsync(loginCommand);
				}

				return true;
			} catch (error) {
				console.log("Error Registry:", error);
				return false;
			}
		}),
});

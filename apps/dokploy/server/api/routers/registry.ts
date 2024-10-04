import {
	apiCreateRegistry,
	apiEnableSelfHostedRegistry,
	apiFindOneRegistry,
	apiRemoveRegistry,
	apiTestRegistry,
	apiUpdateRegistry,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import {
	execAsyncRemote,
	initializeRegistry,
	execAsync,
	manageRegistry,
	createRegistry,
	findAllRegistryByAdminId,
	findRegistryById,
	removeRegistry,
	updateRegistry,
	IS_CLOUD,
} from "@dokploy/builders";
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
					message: "Update: Error to update registry",
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

	enableSelfHostedRegistry: adminProcedure
		.input(apiEnableSelfHostedRegistry)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Self Hosted Registry is not available in the cloud version",
				});
			}
			const selfHostedRegistry = await createRegistry(
				{
					...input,
					registryName: "Self Hosted Registry",
					registryType: "selfHosted",
					registryUrl:
						process.env.NODE_ENV === "production"
							? input.registryUrl
							: "dokploy-registry.docker.localhost",
					imagePrefix: null,
					serverId: undefined,
				},
				ctx.user.adminId,
			);

			await manageRegistry(selfHostedRegistry);
			await initializeRegistry(input.username, input.password);

			return selfHostedRegistry;
		}),
});

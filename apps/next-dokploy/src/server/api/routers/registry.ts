import {
	apiCreateRegistry,
	apiEnableSelfHostedRegistry,
	apiFindOneRegistry,
	apiRemoveRegistry,
	apiTestRegistry,
	apiUpdateRegistry,
} from "@/server/db/schema";
import {
	createRegistry,
	findAllRegistry,
	findRegistryById,
	removeRegistry,
	updateRegistry,
} from "../services/registry";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { manageRegistry } from "@/server/utils/traefik/registry";
import { initializeRegistry } from "@/server/setup/registry-setup";
import { execAsync } from "@/server/utils/process/execAsync";

export const registryRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateRegistry)
		.mutation(async ({ ctx, input }) => {
			return await createRegistry(input);
		}),
	remove: adminProcedure
		.input(apiRemoveRegistry)
		.mutation(async ({ ctx, input }) => {
			return await removeRegistry(input.registryId);
		}),
	update: protectedProcedure
		.input(apiUpdateRegistry)
		.mutation(async ({ input }) => {
			const { registryId, ...rest } = input;
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
	all: protectedProcedure.query(async () => {
		return await findAllRegistry();
	}),
	one: adminProcedure.input(apiFindOneRegistry).query(async ({ input }) => {
		return await findRegistryById(input.registryId);
	}),
	testRegistry: protectedProcedure
		.input(apiTestRegistry)
		.mutation(async ({ input }) => {
			try {
				const loginCommand = `echo ${input.password} | docker login ${input.registryUrl} --username ${input.username} --password-stdin`;
				await execAsync(loginCommand);
				return true;
			} catch (error) {
				console.log("Error Registry:", error);
				return false;
			}
		}),

	enableSelfHostedRegistry: adminProcedure
		.input(apiEnableSelfHostedRegistry)
		.mutation(async ({ input }) => {
			const selfHostedRegistry = await createRegistry({
				...input,
				registryName: "Self Hosted Registry",
				registryType: "selfHosted",
				registryUrl:
					process.env.NODE_ENV === "production"
						? input.registryUrl
						: "dokploy-registry.docker.localhost",
				imagePrefix: null,
			});

			await manageRegistry(selfHostedRegistry);
			await initializeRegistry(input.username, input.password);

			return selfHostedRegistry;
		}),
});

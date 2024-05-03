import {
	apiCreateRegistry,
	apiEnableSelfHostedRegistry,
	apiFindOneRegistry,
	apiRemoveRegistry,
	apiUpdateRegistry,
} from "@/server/db/schema";
import {
	createRegistry,
	findRegistryById,
	removeRegistry,
	updaterRegistry,
} from "../services/registry";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

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
			const application = await updaterRegistry(registryId, {
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
	findOne: adminProcedure.input(apiFindOneRegistry).query(async ({ input }) => {
		return await findRegistryById(input.registryId);
	}),

	enableSelfHostedRegistry: protectedProcedure
		.input(apiEnableSelfHostedRegistry)
		.mutation(async ({ input }) => {
			// return await createRegistry({
			//     username:"CUSTOM"
			//     adminId: input.adminId,
			// });
			// const application = await findRegistryById(input.registryId);
			// const result = await db
			//     .update(registry)
			//     .set({
			//         selfHosted: true,
			//     })
			//     .where(eq(registry.registryId, input.registryId))
			//     .returning();
			// return result[0];
		}),
});

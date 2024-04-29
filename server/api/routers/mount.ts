import { apiCreateMount, apiRemoveMount } from "@/server/db/schema";
import { createMount, deleteMount } from "../services/mount";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const mountRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMount)
		.mutation(async ({ input }) => {
			await createMount(input);
			return true;
		}),
	remove: protectedProcedure
		.input(apiRemoveMount)
		.mutation(async ({ input }) => {
			return await deleteMount(input.mountId);
		}),
});

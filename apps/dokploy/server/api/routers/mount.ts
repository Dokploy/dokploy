import {
	apiCreateMount,
	apiFindOneMount,
	apiRemoveMount,
	apiUpdateMount,
} from "@/server/db/schema";
import {
	createMount,
	deleteMount,
	findMountById,
	updateMount,
} from "@dokploy/server";
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

	one: protectedProcedure.input(apiFindOneMount).query(async ({ input }) => {
		return await findMountById(input.mountId);
	}),
	update: protectedProcedure
		.input(apiUpdateMount)
		.mutation(async ({ input }) => {
			await updateMount(input.mountId, input);
			return true;
		}),
});

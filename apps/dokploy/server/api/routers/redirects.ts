import {
	apiCreateRedirect,
	apiFindOneRedirect,
	apiUpdateRedirect,
} from "@/server/db/schema";
import {
	createRedirect,
	findRedirectById,
	removeRedirectById,
	updateRedirectById,
} from "@dokploy/builders";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const redirectsRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateRedirect)
		.mutation(async ({ input }) => {
			return await createRedirect(input);
		}),
	one: protectedProcedure.input(apiFindOneRedirect).query(async ({ input }) => {
		return findRedirectById(input.redirectId);
	}),
	delete: protectedProcedure
		.input(apiFindOneRedirect)
		.mutation(async ({ input }) => {
			return removeRedirectById(input.redirectId);
		}),
	update: protectedProcedure
		.input(apiUpdateRedirect)
		.mutation(async ({ input }) => {
			return updateRedirectById(input.redirectId, input);
		}),
});

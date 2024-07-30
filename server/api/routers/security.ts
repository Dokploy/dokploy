import {
	apiCreateSecurity,
	apiFindOneSecurity,
	apiUpdateSecurity,
} from "@/server/db/schema";
import {
	createSecurity,
	deleteSecurityById,
	findSecurityById,
	updateSecurityById,
} from "../services/security";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const securityRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateSecurity)
		.mutation(async ({ input }) => {
			return await createSecurity(input);
		}),
	one: protectedProcedure.input(apiFindOneSecurity).query(async ({ input }) => {
		return await findSecurityById(input.securityId);
	}),
	delete: protectedProcedure
		.input(apiFindOneSecurity)
		.mutation(async ({ input }) => {
			return await deleteSecurityById(input.securityId);
		}),
	update: protectedProcedure
		.input(apiUpdateSecurity)
		.mutation(async ({ input }) => {
			return await updateSecurityById(input.securityId, input);
		}),
});

import {
	createSecurity,
	deleteSecurityById,
	findApplicationById,
	findSecurityById,
	updateSecurityById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import {
	apiCreateSecurity,
	apiFindOneSecurity,
	apiUpdateSecurity,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const securityRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateSecurity)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (
				application.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return await createSecurity(input);
		}),
	one: protectedProcedure
		.input(apiFindOneSecurity)
		.query(async ({ input, ctx }) => {
			const security = await findSecurityById(input.securityId);
			const application = await findApplicationById(security.applicationId);
			if (
				application.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return await findSecurityById(input.securityId);
		}),
	delete: protectedProcedure
		.input(apiFindOneSecurity)
		.mutation(async ({ input, ctx }) => {
			const security = await findSecurityById(input.securityId);
			const application = await findApplicationById(security.applicationId);
			if (
				application.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return await deleteSecurityById(input.securityId);
		}),
	update: protectedProcedure
		.input(apiUpdateSecurity)
		.mutation(async ({ input, ctx }) => {
			const security = await findSecurityById(input.securityId);
			const application = await findApplicationById(security.applicationId);
			if (
				application.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return await updateSecurityById(input.securityId, input);
		}),
});

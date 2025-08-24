import {
	createRedirect,
	findApplicationById,
	findRedirectById,
	removeRedirectById,
	updateRedirectById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import {
	apiCreateRedirect,
	apiFindOneRedirect,
	apiUpdateRedirect,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const redirectsRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateRedirect)
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
			return await createRedirect(input);
		}),
	one: protectedProcedure
		.input(apiFindOneRedirect)
		.query(async ({ input, ctx }) => {
			const redirect = await findRedirectById(input.redirectId);
			const application = await findApplicationById(redirect.applicationId);
			if (
				application.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return findRedirectById(input.redirectId);
		}),
	delete: protectedProcedure
		.input(apiFindOneRedirect)
		.mutation(async ({ input, ctx }) => {
			const redirect = await findRedirectById(input.redirectId);
			const application = await findApplicationById(redirect.applicationId);
			if (
				application.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return removeRedirectById(input.redirectId);
		}),
	update: protectedProcedure
		.input(apiUpdateRedirect)
		.mutation(async ({ input, ctx }) => {
			const redirect = await findRedirectById(input.redirectId);
			const application = await findApplicationById(redirect.applicationId);
			if (
				application.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return updateRedirectById(input.redirectId, input);
		}),
});

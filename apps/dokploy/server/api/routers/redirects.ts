import {
	createRedirect,
	findApplicationById,
	findRedirectById,
	removeRedirectById,
	updateRedirectById,
} from "@dokploy/server";
import {
	apiCreateRedirectOutput,
	apiDeleteRedirectOutput,
	apiFindOneRedirectOutput,
	apiUpdateRedirectOutput,
} from "@dokploy/server/api";
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
		.output(apiCreateRedirectOutput)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (
				application.environment.project.organizationId !==
				ctx.session.activeOrganizationId
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
		.output(apiFindOneRedirectOutput)
		.query(async ({ input, ctx }) => {
			const redirect = await findRedirectById(input.redirectId);
			const application = await findApplicationById(redirect.applicationId);
			if (
				application.environment.project.organizationId !==
				ctx.session.activeOrganizationId
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
		.output(apiDeleteRedirectOutput)
		.mutation(async ({ input, ctx }) => {
			const redirect = await findRedirectById(input.redirectId);
			const application = await findApplicationById(redirect.applicationId);
			if (
				application.environment.project.organizationId !==
				ctx.session.activeOrganizationId
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
		.output(apiUpdateRedirectOutput)
		.mutation(async ({ input, ctx }) => {
			const redirect = await findRedirectById(input.redirectId);
			const application = await findApplicationById(redirect.applicationId);
			if (
				application.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return updateRedirectById(input.redirectId, input);
		}),
});

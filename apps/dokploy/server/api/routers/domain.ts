import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	apiCreateDomain,
	apiFindDomain,
	apiFindDomainByApplication,
	apiUpdateDomain,
} from "~/server/db/schema";
import { manageDomain, removeDomain } from "~/server/utils/traefik/domain";
import { findApplicationById } from "../services/application";
import {
	createDomain,
	findDomainById,
	findDomainsByApplicationId,
	generateDomain,
	generateWildcard,
	removeDomainById,
	updateDomainById,
} from "../services/domain";

export const domainRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateDomain)
		.mutation(async ({ input }) => {
			try {
				await createDomain(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the domain",
					cause: error,
				});
			}
		}),
	byApplicationId: protectedProcedure
		.input(apiFindDomainByApplication)
		.query(async ({ input }) => {
			return await findDomainsByApplicationId(input.applicationId);
		}),
	generateDomain: protectedProcedure
		.input(apiFindDomainByApplication)
		.mutation(async ({ input }) => {
			return generateDomain(input);
		}),
	generateWildcard: protectedProcedure
		.input(apiFindDomainByApplication)
		.mutation(async ({ input }) => {
			return generateWildcard(input);
		}),
	update: protectedProcedure
		.input(apiUpdateDomain)
		.mutation(async ({ input }) => {
			const result = await updateDomainById(input.domainId, input);
			const domain = await findDomainById(input.domainId);
			const application = await findApplicationById(domain.applicationId);
			await manageDomain(application, domain);
			return result;
		}),
	one: protectedProcedure.input(apiFindDomain).query(async ({ input }) => {
		return await findDomainById(input.domainId);
	}),
	delete: protectedProcedure
		.input(apiFindDomain)
		.mutation(async ({ input }) => {
			const domain = await findDomainById(input.domainId);
			const result = await removeDomainById(input.domainId);
			await removeDomain(domain.application.appName, domain.uniqueConfigKey);

			return result;
		}),
});

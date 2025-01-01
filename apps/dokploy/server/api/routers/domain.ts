import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiCreateDomain,
	apiFindCompose,
	apiFindDomain,
	apiFindOneApplication,
	apiUpdateDomain,
} from "@/server/db/schema";
import {
	createDomain,
	findApplicationById,
	findComposeById,
	findDomainById,
	findDomainsByApplicationId,
	findDomainsByComposeId,
	findPreviewDeploymentById,
	generateTraefikMeDomain,
	manageDomain,
	removeDomain,
	removeDomainById,
	updateDomainById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const domainRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateDomain)
		.mutation(async ({ input, ctx }) => {
			try {
				if (input.domainType === "compose" && input.composeId) {
					const compose = await findComposeById(input.composeId);
					if (compose.project.adminId !== ctx.user.adminId) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You are not authorized to access this compose",
						});
					}
				} else if (input.domainType === "application" && input.applicationId) {
					const application = await findApplicationById(input.applicationId);
					if (application.project.adminId !== ctx.user.adminId) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You are not authorized to access this application",
						});
					}
				}
				return await createDomain(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the domain",
					cause: error,
				});
			}
		}),
	byApplicationId: protectedProcedure
		.input(apiFindOneApplication)
		.query(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return await findDomainsByApplicationId(input.applicationId);
		}),
	byComposeId: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this compose",
				});
			}
			return await findDomainsByComposeId(input.composeId);
		}),
	generateDomain: protectedProcedure
		.input(z.object({ appName: z.string(), serverId: z.string().optional() }))
		.mutation(async ({ input, ctx }) => {
			return generateTraefikMeDomain(
				input.appName,
				ctx.user.adminId,
				input.serverId,
			);
		}),

	update: protectedProcedure
		.input(apiUpdateDomain)
		.mutation(async ({ input, ctx }) => {
			const currentDomain = await findDomainById(input.domainId);

			if (currentDomain.applicationId) {
				const newApp = await findApplicationById(currentDomain.applicationId);
				if (newApp.project.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this application",
					});
				}
			} else if (currentDomain.composeId) {
				const newCompose = await findComposeById(currentDomain.composeId);
				if (newCompose.project.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this compose",
					});
				}
			} else if (currentDomain.previewDeploymentId) {
				const newPreviewDeployment = await findPreviewDeploymentById(
					currentDomain.previewDeploymentId,
				);
				if (
					newPreviewDeployment.application.project.adminId !== ctx.user.adminId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this preview deployment",
					});
				}
			}
			const result = await updateDomainById(input.domainId, input);
			const domain = await findDomainById(input.domainId);
			if (domain.applicationId) {
				const application = await findApplicationById(domain.applicationId);
				await manageDomain(application, domain);
			} else if (domain.previewDeploymentId) {
				const previewDeployment = await findPreviewDeploymentById(
					domain.previewDeploymentId,
				);
				const application = await findApplicationById(
					previewDeployment.applicationId,
				);
				application.appName = previewDeployment.appName;
				await manageDomain(application, domain);
			}
			return result;
		}),
	one: protectedProcedure.input(apiFindDomain).query(async ({ input, ctx }) => {
		const domain = await findDomainById(input.domainId);
		if (domain.applicationId) {
			const application = await findApplicationById(domain.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
		} else if (domain.composeId) {
			const compose = await findComposeById(domain.composeId);
			if (compose.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this compose",
				});
			}
		}
		return await findDomainById(input.domainId);
	}),
	delete: protectedProcedure
		.input(apiFindDomain)
		.mutation(async ({ input, ctx }) => {
			const domain = await findDomainById(input.domainId);
			if (domain.applicationId) {
				const application = await findApplicationById(domain.applicationId);
				if (application.project.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this application",
					});
				}
			} else if (domain.composeId) {
				const compose = await findComposeById(domain.composeId);
				if (compose.project.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this compose",
					});
				}
			}
			const result = await removeDomainById(input.domainId);

			if (domain.applicationId) {
				const application = await findApplicationById(domain.applicationId);
				await removeDomain(application, domain.uniqueConfigKey);
			}

			return result;
		}),
});

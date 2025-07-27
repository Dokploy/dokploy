import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import {
	apiCreateServiceLink,
	apiFindServiceLink,
	apiUpdateServiceLink,
	apiDeleteServiceLink,
	apiListServiceLinks,
	serviceLinks,
	serviceLinkAttributes,
} from "@/server/db/schema";
import { findProjectById } from "@dokploy/server/services/project";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { checkServiceAccess } from "@dokploy/server";
import { getServiceDetails, resolveServiceAttribute } from "@dokploy/server/utils/service-links";

export const serviceLinksRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateServiceLink)
		.mutation(async ({ ctx, input }) => {
			try {
				// Verify user has access to both source and target services
				if (ctx.user.role === "member") {
					await checkServiceAccess(
						ctx.user.id,
						input.sourceServiceId,
						ctx.session.activeOrganizationId,
						"create",
					);
					await checkServiceAccess(
						ctx.user.id,
						input.targetServiceId,
						ctx.session.activeOrganizationId,
						"access",
					);
				}

				// Verify that both services belong to the same project
				const sourceService = await getServiceDetails(input.sourceServiceId, input.sourceServiceType);
				const targetService = await getServiceDetails(input.targetServiceId, input.targetServiceType);

				if (!sourceService || !targetService) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Source or target service not found",
					});
				}

				if (sourceService.projectId !== targetService.projectId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Services must be in the same project",
					});
				}

				// Verify project access
				const project = await findProjectById(sourceService.projectId);
				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}

				// Check if any of the environment variable names already exist for this source service
				const existingAttributes = await db
					.select()
					.from(serviceLinkAttributes)
					.leftJoin(serviceLinks, eq(serviceLinkAttributes.serviceLinkId, serviceLinks.serviceLinkId))
					.where(
						and(
							eq(serviceLinks.sourceServiceId, input.sourceServiceId),
							eq(serviceLinks.sourceServiceType, input.sourceServiceType)
						)
					);

				const existingEnvVars = existingAttributes.map(attr => attr.serviceLinkAttribute?.envVariableName).filter(Boolean);
				const newEnvVars = input.attributes.map(attr => attr.envVariableName);
				const conflicts = newEnvVars.filter(envVar => existingEnvVars.includes(envVar));

				if (conflicts.length > 0) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Environment variable names already exist: ${conflicts.join(", ")}`,
					});
				}

				// Check for duplicate env var names within the new attributes
				const duplicates = newEnvVars.filter((envVar, index) => newEnvVars.indexOf(envVar) !== index);
				if (duplicates.length > 0) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Duplicate environment variable names: ${duplicates.join(", ")}`,
					});
				}

				// Create the service link
				const [newServiceLink] = await db
					.insert(serviceLinks)
					.values({
						sourceServiceId: input.sourceServiceId,
						sourceServiceType: input.sourceServiceType,
						targetServiceId: input.targetServiceId,
						targetServiceType: input.targetServiceType,
					})
					.returning();

				// Create the attributes
				const attributesToInsert = input.attributes.map(attr => ({
					serviceLinkId: newServiceLink!.serviceLinkId,
					attribute: attr.attribute,
					envVariableName: attr.envVariableName,
				}));

				await db
					.insert(serviceLinkAttributes)
					.values(attributesToInsert);

				return newServiceLink;
			} catch (error) {
				throw error;
			}
		}),

	findById: protectedProcedure
		.input(apiFindServiceLink)
		.query(async ({ ctx, input }) => {
			const serviceLink = await db
				.select()
				.from(serviceLinks)
				.where(eq(serviceLinks.serviceLinkId, input.serviceLinkId))
				.limit(1);

			if (serviceLink.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Service link not found",
				});
			}

			const link = serviceLink[0];
			if (!link) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Service link not found",
				});
			}

			// Verify user has access to the source service
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					link.sourceServiceId,
					ctx.session.activeOrganizationId,
					"access",
				);
			}

			// Verify project access
			const sourceService = await getServiceDetails(link.sourceServiceId, link.sourceServiceType);
			if (!sourceService) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Source service not found",
				});
			}

			const project = await findProjectById(sourceService.projectId);
			if (project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this service link",
				});
			}

			// Get attributes for this service link
			const attributes = await db
				.select()
				.from(serviceLinkAttributes)
				.where(eq(serviceLinkAttributes.serviceLinkId, link.serviceLinkId));

			// Get target service details
			const targetService = await getServiceDetails(link.targetServiceId, link.targetServiceType);

			return {
				...link,
				attributes,
				targetService,
			};
		}),

	list: protectedProcedure
		.input(apiListServiceLinks)
		.query(async ({ ctx, input }) => {
			// Verify user has access to the source service
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.sourceServiceId,
					ctx.session.activeOrganizationId,
					"access",
				);
			}

			// Verify project access
			const sourceService = await getServiceDetails(input.sourceServiceId, input.sourceServiceType);
			if (!sourceService) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Source service not found",
				});
			}

			const project = await findProjectById(sourceService.projectId);
			if (project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this service",
				});
			}

			const links = await db
				.select()
				.from(serviceLinks)
				.where(
					and(
						eq(serviceLinks.sourceServiceId, input.sourceServiceId),
						eq(serviceLinks.sourceServiceType, input.sourceServiceType)
					)
				);

			// Fetch target service details and attributes for each link
			const linksWithDetails = await Promise.all(
				links.map(async (link) => {
					const targetService = await getServiceDetails(link.targetServiceId, link.targetServiceType);
					
					// Get all attributes for this service link
					const attributes = await db
						.select()
						.from(serviceLinkAttributes)
						.where(eq(serviceLinkAttributes.serviceLinkId, link.serviceLinkId));
					
					return {
						...link,
						targetService,
						attributes,
					};
				})
			);

			return linksWithDetails;
		}),

	update: protectedProcedure
		.input(apiUpdateServiceLink)
		.mutation(async ({ ctx, input }) => {
			try {
				const existingLink = await db
					.select()
					.from(serviceLinks)
					.where(eq(serviceLinks.serviceLinkId, input.serviceLinkId))
					.limit(1);

				if (existingLink.length === 0) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Service link not found",
					});
				}

				const link = existingLink[0];
				if (!link) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Service link not found",
					});
				}

				// Verify user has access to the source service
				if (ctx.user.role === "member") {
					await checkServiceAccess(
						ctx.user.id,
						link.sourceServiceId,
						ctx.session.activeOrganizationId,
						"create",
					);
					await checkServiceAccess(
						ctx.user.id,
						input.targetServiceId,
						ctx.session.activeOrganizationId,
						"access",
					);
				}

				// Verify project access
				const sourceService = await getServiceDetails(link.sourceServiceId, link.sourceServiceType);
				const targetService = await getServiceDetails(input.targetServiceId, input.targetServiceType);

				if (!sourceService || !targetService) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Source or target service not found",
					});
				}

				if (sourceService.projectId !== targetService.projectId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Services must be in the same project",
					});
				}

				const project = await findProjectById(sourceService.projectId);
				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this service link",
					});
				}

				// Check for conflicting environment variable names with other service links
				const existingAttributes = await db
					.select()
					.from(serviceLinkAttributes)
					.leftJoin(serviceLinks, eq(serviceLinkAttributes.serviceLinkId, serviceLinks.serviceLinkId))
					.where(
						and(
							eq(serviceLinks.sourceServiceId, link.sourceServiceId),
							eq(serviceLinks.sourceServiceType, link.sourceServiceType)
						)
					);

				const otherEnvVars = existingAttributes
					.filter(attr => attr.serviceLinkAttribute?.serviceLinkId !== input.serviceLinkId)
					.map(attr => attr.serviceLinkAttribute?.envVariableName)
					.filter(Boolean);

				const newEnvVars = input.attributes.map(attr => attr.envVariableName);
				const conflicts = newEnvVars.filter(envVar => otherEnvVars.includes(envVar));

				if (conflicts.length > 0) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Environment variable names already exist: ${conflicts.join(", ")}`,
					});
				}

				// Check for duplicate env var names within the new attributes
				const duplicates = newEnvVars.filter((envVar, index) => newEnvVars.indexOf(envVar) !== index);
				if (duplicates.length > 0) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Duplicate environment variable names: ${duplicates.join(", ")}`,
					});
				}

				// Update the service link
				const [updatedLink] = await db
					.update(serviceLinks)
					.set({
						targetServiceId: input.targetServiceId,
						targetServiceType: input.targetServiceType,
					})
					.where(eq(serviceLinks.serviceLinkId, input.serviceLinkId))
					.returning();

				// Delete existing attributes and insert new ones
				await db
					.delete(serviceLinkAttributes)
					.where(eq(serviceLinkAttributes.serviceLinkId, input.serviceLinkId));

				const attributesToInsert = input.attributes.map(attr => ({
					serviceLinkId: input.serviceLinkId,
					attribute: attr.attribute,
					envVariableName: attr.envVariableName,
				}));

				await db
					.insert(serviceLinkAttributes)
					.values(attributesToInsert);

				return updatedLink;
			} catch (error) {
				throw error;
			}
		}),

	delete: protectedProcedure
		.input(apiDeleteServiceLink)
		.mutation(async ({ ctx, input }) => {
			try {
				const existingLink = await db
					.select()
					.from(serviceLinks)
					.where(eq(serviceLinks.serviceLinkId, input.serviceLinkId))
					.limit(1);

				if (existingLink.length === 0) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Service link not found",
					});
				}

				const link = existingLink[0];
				if (!link) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Service link not found",
					});
				}

				// Verify user has access to the source service
				if (ctx.user.role === "member") {
					await checkServiceAccess(
						ctx.user.id,
						link.sourceServiceId,
						ctx.session.activeOrganizationId,
						"create",
					);
				}

				// Verify project access
				const sourceService = await getServiceDetails(link.sourceServiceId, link.sourceServiceType);
				if (!sourceService) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Source service not found",
					});
				}

				const project = await findProjectById(sourceService.projectId);
				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this service link",
					});
				}

				await db
					.delete(serviceLinks)
					.where(eq(serviceLinks.serviceLinkId, input.serviceLinkId));

				return { success: true };
			} catch (error) {
				throw error;
			}
		}),
});
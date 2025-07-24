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
	applications,
	compose,
	postgres,
	mysql,
	mariadb,
	mongo,
	redis,
	domains,
	findProjectById,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { checkServiceAccess } from "@dokploy/server";

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

				// Check if a service link with the same env variable name already exists for this source service
				const existingLink = await db
					.select()
					.from(serviceLinks)
					.where(
						and(
							eq(serviceLinks.sourceServiceId, input.sourceServiceId),
							eq(serviceLinks.envVariableName, input.envVariableName)
						)
					)
					.limit(1);

				if (existingLink.length > 0) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "Environment variable name already exists for this service",
					});
				}

				const [newServiceLink] = await db
					.insert(serviceLinks)
					.values(input)
					.returning();

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

			return link;
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

			// Fetch target service details for each link
			const linksWithTargetDetails = await Promise.all(
				links.map(async (link) => {
					const targetService = await getServiceDetails(link.targetServiceId, link.targetServiceType);
					return {
						...link,
						targetService,
					};
				})
			);

			return linksWithTargetDetails;
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

				// Check if the new env variable name conflicts with existing ones (excluding current link)
				if (input.envVariableName !== link.envVariableName) {
					const conflictingLink = await db
						.select()
						.from(serviceLinks)
						.where(
							and(
								eq(serviceLinks.sourceServiceId, link.sourceServiceId),
								eq(serviceLinks.envVariableName, input.envVariableName),
								eq(serviceLinks.serviceLinkId, input.serviceLinkId)
							)
						)
						.limit(1);

					if (conflictingLink.length > 0) {
						throw new TRPCError({
							code: "CONFLICT",
							message: "Environment variable name already exists for this service",
						});
					}
				}

				const [updatedLink] = await db
					.update(serviceLinks)
					.set({
						targetServiceId: input.targetServiceId,
						targetServiceType: input.targetServiceType,
						attribute: input.attribute,
						envVariableName: input.envVariableName,
					})
					.where(eq(serviceLinks.serviceLinkId, input.serviceLinkId))
					.returning();

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

// Helper function to get service details regardless of service type
async function getServiceDetails(serviceId: string, serviceType: string) {
	switch (serviceType) {
		case "application": {
			const [service] = await db
				.select()
				.from(applications)
				.where(eq(applications.applicationId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		case "compose": {
			const [service] = await db
				.select()
				.from(compose)
				.where(eq(compose.composeId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		case "postgres": {
			const [service] = await db
				.select()
				.from(postgres)
				.where(eq(postgres.postgresId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		case "mysql": {
			const [service] = await db
				.select()
				.from(mysql)
				.where(eq(mysql.mysqlId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		case "mariadb": {
			const [service] = await db
				.select()
				.from(mariadb)
				.where(eq(mariadb.mariadbId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		case "mongo": {
			const [service] = await db
				.select()
				.from(mongo)
				.where(eq(mongo.mongoId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		case "redis": {
			const [service] = await db
				.select()
				.from(redis)
				.where(eq(redis.redisId, serviceId))
				.limit(1);
			return service ? { ...service, projectId: service.projectId } : null;
		}
		default:
			return null;
	}
}

// Helper function to resolve service attribute values
export async function resolveServiceAttribute(
	serviceId: string,
	serviceType: string,
	attribute: string
): Promise<string | null> {
	const service = await getServiceDetails(serviceId, serviceType);
	if (!service) return null;

	switch (attribute) {
		case "fqdn": {
			// Get the primary domain for this service
			const [domain] = await db
				.select()
				.from(domains)
				.where(
					serviceType === "application"
						? eq(domains.applicationId, serviceId)
						: eq(domains.composeId, serviceId)
				)
				.limit(1);
			
			if (!domain) return null;
			
			const protocol = domain.https ? "https" : "http";
			const port = domain.port && domain.port !== 80 && domain.port !== 443 ? `:${domain.port}` : "";
			return `${protocol}://${domain.host}${port}${domain.path || ""}`;
		}
		case "hostname": {
			// For internal hostname, we use the appName which is used for container networking
			return (service as any).appName || null;
		}
		case "port": {
			// For internal port, we need to look at the service configuration
			// This is service-specific and might need additional logic
			if (serviceType === "postgres") return "5432";
			if (serviceType === "mysql") return "3306";
			if (serviceType === "mariadb") return "3306";
			if (serviceType === "mongo") return "27017";
			if (serviceType === "redis") return "6379";
			// For applications and compose, we might need additional logic
			return "3000"; // Default fallback
		}
		default:
			return null;
	}
}
import {
	createExternalUpstream,
	findEnvironmentById,
	findExternalUpstreamById,
	findProjectById,
	getAccessibleServerIds,
	getWebServerSettings,
	IS_CLOUD,
	manageExternalUpstreamDomain,
	removeExternalUpstreamById,
	removeExternalUpstreamDomain,
	updateExternalUpstreamById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	addNewService,
	checkServiceAccess,
	checkServicePermissionAndAccess,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateExternalUpstream,
	apiFindOneExternalUpstream,
	apiMoveExternalUpstream,
	apiUpdateExternalUpstream,
	externalUpstreams,
} from "@/server/db/schema";

export const externalUpstreamRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateExternalUpstream)
		.mutation(async ({ input, ctx }) => {
			const settings = await getWebServerSettings();
			if (IS_CLOUD || !settings?.externalUpstreamsEnabled) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "External Upstreams are disabled",
				});
			}

			const environment = await findEnvironmentById(input.environmentId);
			const project = await findProjectById(environment.projectId);

			await checkServiceAccess(ctx, project.projectId, "create");

			if ((IS_CLOUD || settings.remoteServersOnly) && !input.serverId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message:
						"You need to use a server to create an external upstream",
				});
			}

			if (project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this project",
				});
			}

			if (input.serverId) {
				const accessibleIds = await getAccessibleServerIds(ctx.session);
				if (!accessibleIds.has(input.serverId)) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this server",
					});
				}
			}

			const service = await createExternalUpstream(input);
			await addNewService(ctx, service.externalUpstreamId);
			await audit(ctx, {
				action: "create",
				resourceType: "service",
				resourceId: service.externalUpstreamId,
				resourceName: service.appName,
			});

			return service;
		}),
	one: protectedProcedure
		.input(apiFindOneExternalUpstream)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.externalUpstreamId, "read");
			const service = await findExternalUpstreamById(
				input.externalUpstreamId,
			);
			if (
				service.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message:
						"You are not authorized to access this external upstream",
				});
			}
			return service;
		}),
	update: protectedProcedure
		.input(apiUpdateExternalUpstream)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.externalUpstreamId, {
				service: ["create"],
			});

			const current = await findExternalUpstreamById(
				input.externalUpstreamId,
			);
			const updated = await updateExternalUpstreamById(
				input.externalUpstreamId,
				input,
			);

			for (const domain of current.domains) {
				await removeExternalUpstreamDomain(current, domain.uniqueConfigKey);
			}

			if (updated) {
				const refreshed = await findExternalUpstreamById(
					input.externalUpstreamId,
				);
				for (const domain of refreshed.domains) {
					await manageExternalUpstreamDomain(refreshed, domain);
				}
			}

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: current.externalUpstreamId,
				resourceName: current.appName,
			});

			return updated;
		}),
	delete: protectedProcedure
		.input(apiFindOneExternalUpstream)
		.mutation(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.externalUpstreamId, "delete");
			const service = await findExternalUpstreamById(
				input.externalUpstreamId,
			);

			if (
				service.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message:
						"You are not authorized to delete this external upstream",
				});
			}

			for (const domain of service.domains) {
				await removeExternalUpstreamDomain(service, domain.uniqueConfigKey);
			}

			const result = await removeExternalUpstreamById(
				input.externalUpstreamId,
			);

			await audit(ctx, {
				action: "delete",
				resourceType: "service",
				resourceId: service.externalUpstreamId,
				resourceName: service.appName,
			});

			return {
				...result,
				environment: service.environment,
			};
		}),
	move: protectedProcedure
		.input(apiMoveExternalUpstream)
		.mutation(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.externalUpstreamId, "read");
			const service = await findExternalUpstreamById(
				input.externalUpstreamId,
			);
			const targetEnvironment = await findEnvironmentById(
				input.targetEnvironmentId,
			);

			if (
				service.environment.project.organizationId !==
					ctx.session.activeOrganizationId ||
				targetEnvironment.project.organizationId !==
					ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move this service",
				});
			}

			const updated = await db
				.update(externalUpstreams)
				.set({
					environmentId: input.targetEnvironmentId,
				})
				.where(
					eq(
						externalUpstreams.externalUpstreamId,
						input.externalUpstreamId,
					),
				)
				.returning();

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: service.externalUpstreamId,
				resourceName: service.appName,
			});

			return updated[0];
		}),
});

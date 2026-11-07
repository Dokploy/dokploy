import { db } from "@dokploy/server/db";
import {
	apiAzureDevopsService,
	apiCreateAzureDevops,
	apiFindAzureDevops,
	apiUpdateAzureDevops,
} from "@dokploy/server/db/schema";
import { findApplicationById } from "@dokploy/server/services/application";
import {
	assertAzureDevopsSourceAccess,
	createAzureDevops,
	findAzureDevopsById,
	safeAzureDevops,
	updateAzureDevops,
} from "@dokploy/server/services/azure-devops";
import {
	getAzureDevopsHookStatus,
	syncAzureDevopsWebhook,
} from "@dokploy/server/services/azure-devops-hooks";
import { findComposeById } from "@dokploy/server/services/compose";
import {
	assertGitProviderAccess,
	getAccessibleGitProviderIds,
} from "@dokploy/server/services/git-provider";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { AzureDevopsClient } from "@dokploy/server/utils/providers/azure-devops-client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";

const projectInput = apiFindAzureDevops.extend({
	projectId: z.string().uuid(),
});
const repositoryInput = projectInput.extend({
	repositoryId: z.string().uuid(),
});
const authorizedProvider = async (
	session: { userId: string; activeOrganizationId: string },
	id: string,
) => {
	const provider = await findAzureDevopsById(id);
	await assertGitProviderAccess(session, provider.gitProvider);
	return provider;
};
const clientFor = async (
	session: { userId: string; activeOrganizationId: string },
	id: string,
) => {
	const provider = await authorizedProvider(session, id);
	return new AzureDevopsClient(provider.baseUrl, provider.personalAccessToken);
};

export const azureDevopsRouter = createTRPCRouter({
	create: withPermission("gitProviders", "create")
		.input(apiCreateAzureDevops)
		.mutation(async ({ input, ctx }) => {
			const result = await createAzureDevops(
				input,
				ctx.session.activeOrganizationId,
				ctx.session.userId,
			);
			await audit(ctx, {
				action: "create",
				resourceType: "gitProvider",
				resourceId: result.azureDevopsId,
				resourceName: input.name,
			});
			return result;
		}),
	one: protectedProcedure
		.input(apiFindAzureDevops)
		.query(async ({ input, ctx }) =>
			safeAzureDevops(
				await authorizedProvider(ctx.session, input.azureDevopsId),
			),
		),
	providers: protectedProcedure.query(async ({ ctx }) => {
		const ids = await getAccessibleGitProviderIds(ctx.session);
		const providers = await db.query.azureDevops.findMany({
			columns: { personalAccessToken: false },
			with: { gitProvider: true },
		});
		return providers.filter(
			(provider) =>
				provider.gitProvider.organizationId ===
					ctx.session.activeOrganizationId && ids.has(provider.gitProviderId),
		);
	}),
	update: withPermission("gitProviders", "create")
		.input(apiUpdateAzureDevops)
		.mutation(async ({ input, ctx }) => {
			const result = await updateAzureDevops(input, ctx.session);
			await audit(ctx, {
				action: "update",
				resourceType: "gitProvider",
				resourceId: input.azureDevopsId,
			});
			return result;
		}),
	testConnection: protectedProcedure
		.input(apiFindAzureDevops)
		.mutation(async ({ input, ctx }) => {
			const projects = await (
				await clientFor(ctx.session, input.azureDevopsId)
			).projects();
			return { success: true, projectCount: projects.length };
		}),
	projects: protectedProcedure
		.input(apiFindAzureDevops)
		.query(async ({ input, ctx }) =>
			(await clientFor(ctx.session, input.azureDevopsId)).projects(),
		),
	repositories: protectedProcedure
		.input(projectInput)
		.query(async ({ input, ctx }) =>
			(await clientFor(ctx.session, input.azureDevopsId)).repositories(
				input.projectId,
			),
		),
	branches: protectedProcedure
		.input(repositoryInput)
		.query(async ({ input, ctx }) =>
			(await clientFor(ctx.session, input.azureDevopsId)).branches(
				input.projectId,
				input.repositoryId,
			),
		),
	hookStatus: protectedProcedure
		.input(apiAzureDevopsService)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.serviceId, {
				service: ["read"],
			});
			const service =
				input.serviceType === "application"
					? await findApplicationById(input.serviceId)
					: await findComposeById(input.serviceId);
			if (
				service.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Service not found",
				});
			if (service.azureDevopsId)
				await authorizedProvider(ctx.session, service.azureDevopsId);
			return getAzureDevopsHookStatus(input.serviceType, input.serviceId);
		}),
	syncWebhook: protectedProcedure
		.input(apiAzureDevopsService)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.serviceId, {
				service: ["create"],
			});
			const service =
				input.serviceType === "application"
					? await findApplicationById(input.serviceId)
					: await findComposeById(input.serviceId);
			if (
				service.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Service not found",
				});
			if (service.azureDevopsId)
				await authorizedProvider(ctx.session, service.azureDevopsId);
			await assertAzureDevopsSourceAccess(ctx.session, service);
			return syncAzureDevopsWebhook(input.serviceType, input.serviceId);
		}),
	cleanupPending: withPermission("gitProviders", "delete").query(
		async ({ ctx }) =>
			db.query.azureDevopsHook.findMany({
				where: (hook, { and, eq }) =>
					and(
						eq(hook.organizationId, ctx.session.activeOrganizationId),
						eq(hook.status, "cleanupPending"),
					),
			}),
	),
});

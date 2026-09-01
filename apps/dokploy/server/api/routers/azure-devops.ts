import {
	assertGitProviderAccess,
	canViewGitProviderSecrets,
	createAzureDevops,
	findAzureDevopsById,
	getAccessibleGitProviderIds,
	getAzureDevopsBranches,
	getAzureDevopsRepositories,
	testAzureDevopsConnection,
	updateAzureDevops,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiAzureDevopsTestConnection,
	apiCreateAzureDevops,
	apiFindAzureDevopsBranches,
	apiFindOneAzureDevops,
	apiUpdateAzureDevops,
} from "@/server/db/schema";

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
				resourceName: input.name,
			});
			return result;
		}),
	one: protectedProcedure
		.input(apiFindOneAzureDevops)
		.query(async ({ input, ctx }) => {
			const provider = await findAzureDevopsById(input.azureDevopsId);
			await assertGitProviderAccess(ctx.session, provider.gitProvider);
			if (
				!(await canViewGitProviderSecrets(ctx.session, provider.gitProvider))
			) {
				return { ...provider, personalAccessToken: null };
			}
			return provider;
		}),
	providers: protectedProcedure.query(async ({ ctx }) => {
		const accessibleIds = await getAccessibleGitProviderIds(ctx.session);
		const providers = await db.query.azureDevops.findMany({
			with: { gitProvider: true },
			columns: { azureDevopsId: true },
		});
		return providers.filter(
			(provider) =>
				provider.gitProvider.organizationId ===
					ctx.session.activeOrganizationId &&
				accessibleIds.has(provider.gitProvider.gitProviderId),
		);
	}),
	repositories: protectedProcedure
		.input(apiFindOneAzureDevops)
		.query(async ({ input, ctx }) => {
			const provider = await findAzureDevopsById(input.azureDevopsId);
			await assertGitProviderAccess(ctx.session, provider.gitProvider);
			return getAzureDevopsRepositories(input.azureDevopsId);
		}),
	branches: protectedProcedure
		.input(apiFindAzureDevopsBranches)
		.query(async ({ input, ctx }) => {
			const provider = await findAzureDevopsById(input.azureDevopsId);
			await assertGitProviderAccess(ctx.session, provider.gitProvider);
			return getAzureDevopsBranches(input);
		}),
	testConnection: protectedProcedure
		.input(apiAzureDevopsTestConnection)
		.mutation(async ({ input, ctx }) => {
			const provider = await findAzureDevopsById(input.azureDevopsId);
			await assertGitProviderAccess(ctx.session, provider.gitProvider);
			try {
				const count = await testAzureDevopsConnection(input.azureDevopsId);
				return `Found ${count} repositories`;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),
	update: withPermission("gitProviders", "create")
		.input(apiUpdateAzureDevops)
		.mutation(async ({ input, ctx }) => {
			const provider = await findAzureDevopsById(input.azureDevopsId);
			await assertGitProviderAccess(ctx.session, provider.gitProvider);
			const result = await updateAzureDevops(input.azureDevopsId, {
				...input,
				organizationId: ctx.session.activeOrganizationId,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "gitProvider",
				resourceId: input.azureDevopsId,
				resourceName: input.name,
			});
			return result;
		}),
});

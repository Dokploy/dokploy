import {
	assertGitProviderAccess,
	assertGitProviderManagementAccess,
	createGitlab,
	findGitlabById,
	findGitlabGitProviderId,
	getAccessibleGitProviderIds,
	getGitlabBranches,
	getGitlabRepositories,
	haveGitlabRequirements,
	redactGitlabProvider,
	testGitlabConnection,
	updateGitlab,
	updateGitProvider,
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
	apiCreateGitlab,
	apiFindGitlabBranches,
	apiFindOneGitlab,
	apiGitlabTestConnection,
	apiUpdateGitlab,
} from "@/server/db/schema";

export const gitlabRouter = createTRPCRouter({
	create: withPermission("gitProviders", "create")
		.input(apiCreateGitlab)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await createGitlab(
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
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating this Gitlab provider",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneGitlab)
		.query(async ({ input, ctx }) => {
			const gitProviderId = await findGitlabGitProviderId(input.gitlabId);
			await assertGitProviderAccess(gitProviderId, ctx.session);

			return redactGitlabProvider(await findGitlabById(input.gitlabId));
		}),
	gitlabProviders: protectedProcedure.query(async ({ ctx }) => {
		const accessibleIds = await getAccessibleGitProviderIds(ctx.session);

		let result = await db.query.gitlab.findMany({
			with: {
				gitProvider: true,
			},
		});

		result = result.filter((provider) => {
			return (
				provider.gitProvider.organizationId ===
					ctx.session.activeOrganizationId &&
				accessibleIds.has(provider.gitProvider.gitProviderId)
			);
		});
		const filtered = result
			.filter((provider) => haveGitlabRequirements(provider))
			.map((provider) => {
				return {
					gitlabId: provider.gitlabId,
					gitProvider: {
						...provider.gitProvider,
					},
					gitlabUrl: provider.gitlabUrl,
				};
			});

		return filtered;
	}),
	getGitlabRepositories: protectedProcedure
		.input(apiFindOneGitlab)
		.query(async ({ input, ctx }) => {
			const gitProviderId = await findGitlabGitProviderId(input.gitlabId);
			await assertGitProviderAccess(gitProviderId, ctx.session);

			return await getGitlabRepositories(input.gitlabId);
		}),

	getGitlabBranches: protectedProcedure
		.input(apiFindGitlabBranches)
		.query(async ({ input, ctx }) => {
			if (input.gitlabId) {
				const gitProviderId = await findGitlabGitProviderId(input.gitlabId);
				await assertGitProviderAccess(gitProviderId, ctx.session);
			}

			return await getGitlabBranches(input);
		}),
	testConnection: protectedProcedure
		.input(apiGitlabTestConnection)
		.mutation(async ({ input, ctx }) => {
			const gitProviderId = await findGitlabGitProviderId(input.gitlabId);
			await assertGitProviderAccess(gitProviderId, ctx.session);
			await assertGitProviderManagementAccess(gitProviderId, ctx.session);

			try {
				const result = await testGitlabConnection(input);

				return `Found ${result} repositories`;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error?.message : `Error: ${error}`,
				});
			}
		}),
	update: withPermission("gitProviders", "create")
		.input(apiUpdateGitlab)
		.mutation(async ({ input, ctx }) => {
			const gitProviderId = await findGitlabGitProviderId(input.gitlabId);
			if (gitProviderId !== input.gitProviderId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this Git provider",
				});
			}
			await assertGitProviderAccess(gitProviderId, ctx.session);
			await assertGitProviderManagementAccess(gitProviderId, ctx.session);

			if (input.name) {
				await updateGitProvider(gitProviderId, {
					name: input.name,
					organizationId: ctx.session.activeOrganizationId,
				});

				await updateGitlab(input.gitlabId, {
					...input,
					gitProviderId,
				});
			} else {
				await updateGitlab(input.gitlabId, {
					...input,
					gitProviderId,
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "gitProvider",
				resourceId: gitProviderId,
				resourceName: input.name,
			});
		}),
});

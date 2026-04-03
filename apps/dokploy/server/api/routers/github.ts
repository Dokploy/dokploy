import {
	findGithubById,
	getGithubBranches,
	getGithubRepositories,
	haveGithubRequirements,
	updateGithub,
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
import { assertGitProviderAccess } from "@/server/api/utils/git-provider";
import {
	apiFindGithubBranches,
	apiFindOneGithub,
	apiUpdateGithub,
} from "@/server/db/schema";

export const githubRouter = createTRPCRouter({
	one: protectedProcedure
		.input(apiFindOneGithub)
		.query(async ({ input, ctx }) => {
			const provider = await findGithubById(input.githubId);
			assertGitProviderAccess(provider, ctx.session.activeOrganizationId);
			return provider;
		}),
	getGithubRepositories: protectedProcedure
		.input(apiFindOneGithub)
		.query(async ({ input, ctx }) => {
			const provider = await findGithubById(input.githubId);
			assertGitProviderAccess(provider, ctx.session.activeOrganizationId);
			return await getGithubRepositories(input.githubId);
		}),
	getGithubBranches: protectedProcedure
		.input(apiFindGithubBranches)
		.query(async ({ input, ctx }) => {
			const provider = await findGithubById(input.githubId || "");
			assertGitProviderAccess(provider, ctx.session.activeOrganizationId);
			return await getGithubBranches(input);
		}),
	githubProviders: protectedProcedure.query(async ({ ctx }) => {
		let result = await db.query.github.findMany({
			with: {
				gitProvider: true,
			},
		});

		result = result.filter(
			(provider) =>
				provider.gitProvider.organizationId ===
				ctx.session.activeOrganizationId,
		);

		const filtered = result
			.filter((provider) => haveGithubRequirements(provider))
			.map((provider) => {
				return {
					githubId: provider.githubId,
					gitProvider: {
						...provider.gitProvider,
					},
				};
			});

		return filtered;
	}),

	testConnection: protectedProcedure
		.input(apiFindOneGithub)
		.mutation(async ({ input, ctx }) => {
			try {
				const provider = await findGithubById(input.githubId);
				assertGitProviderAccess(provider, ctx.session.activeOrganizationId);
				const result = await getGithubRepositories(input.githubId);
				return `Found ${result.length} repositories`;
			} catch (err) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: err instanceof Error ? err?.message : `Error: ${err}`,
				});
			}
		}),
	update: withPermission("gitProviders", "create")
		.input(apiUpdateGithub)
		.mutation(async ({ input, ctx }) => {
			const provider = await findGithubById(input.githubId);
			assertGitProviderAccess(provider, ctx.session.activeOrganizationId);
			await updateGitProvider(input.gitProviderId, {
				name: input.name,
				organizationId: ctx.session.activeOrganizationId,
			});

			await updateGithub(input.githubId, {
				...input,
			});

			await audit(ctx, {
				action: "update",
				resourceType: "gitProvider",
				resourceId: input.gitProviderId,
				resourceName: input.name,
			});
		}),
});

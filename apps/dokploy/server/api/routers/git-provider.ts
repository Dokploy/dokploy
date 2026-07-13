import {
	findGitProviderById,
	getAccessibleGitProviderIds,
	removeGitProvider,
	updateGitProvider,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { findMemberByUserId } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { desc, eq, inArray } from "drizzle-orm";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiRemoveGitProvider,
	apiToggleShareGitProvider,
	gitProvider,
} from "@/server/db/schema";

export const gitProviderRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		const accessibleIds = await getAccessibleGitProviderIds(ctx.session);

		if (accessibleIds.size === 0) {
			return [];
		}

		const results = await db.query.gitProvider.findMany({
			with: {
				gitlab: true,
				bitbucket: true,
				github: true,
				gitea: true,
			},
			orderBy: desc(gitProvider.createdAt),
			where: inArray(gitProvider.gitProviderId, [...accessibleIds]),
		});

		return results.map((r) => ({
			...r,
			isOwner: r.userId === ctx.session.userId,
			github: r.github
				? {
						githubId: r.github.githubId,
						githubAppName: r.github.githubAppName,
						githubAppId: r.github.githubAppId,
						githubInstallationId: r.github.githubInstallationId,
						isConfigured: !!(
							r.github.githubPrivateKey &&
							r.github.githubAppId &&
							r.github.githubInstallationId
						),
					}
				: null,
			gitlab: r.gitlab
				? {
						gitlabId: r.gitlab.gitlabId,
						applicationId: r.gitlab.applicationId,
						gitlabUrl: r.gitlab.gitlabUrl,
						isConfigured: !!(r.gitlab.accessToken && r.gitlab.refreshToken),
					}
				: null,
			bitbucket: r.bitbucket
				? {
						bitbucketId: r.bitbucket.bitbucketId,
						bitbucketUsername: r.bitbucket.bitbucketUsername,
						isConfigured: false,
						isDeprecated: !!(r.bitbucket.appPassword && !r.bitbucket.apiToken),
					}
				: null,
			gitea: r.gitea
				? {
						giteaId: r.gitea.giteaId,
						giteaUrl: r.gitea.giteaUrl,
						clientId: r.gitea.clientId,
						isConfigured: !!(r.gitea.accessToken && r.gitea.refreshToken),
					}
				: null,
		}));
	}),

	toggleShare: protectedProcedure
		.input(apiToggleShareGitProvider)
		.mutation(async ({ input, ctx }) => {
			const provider = await findGitProviderById(input.gitProviderId);

			if (
				provider.userId !== ctx.session.userId ||
				provider.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Only the owner can share this provider",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "gitProvider",
				resourceId: provider.gitProviderId,
				resourceName: provider.name ?? provider.gitProviderId,
			});

			return await updateGitProvider(input.gitProviderId, {
				sharedWithOrganization: input.sharedWithOrganization,
			});
		}),

	allForPermissions: withPermission("member", "update").query(
		async ({ ctx }) => {
			return await db.query.gitProvider.findMany({
				columns: {
					gitProviderId: true,
					name: true,
					providerType: true,
				},
				orderBy: desc(gitProvider.createdAt),
				where: eq(gitProvider.organizationId, ctx.session.activeOrganizationId),
			});
		},
	),

	remove: withPermission("gitProviders", "delete")
		.input(apiRemoveGitProvider)
		.mutation(async ({ input, ctx }) => {
			try {
				const gitProvider = await findGitProviderById(input.gitProviderId);

				if (gitProvider.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to delete this Git provider",
					});
				}

				const memberRecord = await findMemberByUserId(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);
				const isPrivileged =
					memberRecord.role === "owner" || memberRecord.role === "admin";
				if (!isPrivileged && gitProvider.userId !== ctx.session.userId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You can only delete your own Git providers",
					});
				}
				await audit(ctx, {
					action: "delete",
					resourceType: "gitProvider",
					resourceId: gitProvider.gitProviderId,
					resourceName: gitProvider.name ?? gitProvider.gitProviderId,
				});
				return await removeGitProvider(input.gitProviderId);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Error deleting this Git provider";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message,
				});
			}
		}),
});

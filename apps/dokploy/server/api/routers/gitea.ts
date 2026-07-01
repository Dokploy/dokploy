import {
	assertGitProviderAccess,
	assertGitProviderManagementAccess,
	createGitea,
	findGiteaById,
	findGiteaGitProviderId,
	getAccessibleGitProviderIds,
	getGiteaBranches,
	getGiteaRepositories,
	haveGiteaRequirements,
	redactGiteaProvider,
	testGiteaConnection,
	updateGitea,
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
	apiCreateGitea,
	apiFindGiteaBranches,
	apiFindOneGitea,
	apiGiteaTestConnection,
	apiUpdateGitea,
} from "@/server/db/schema";

export const giteaRouter = createTRPCRouter({
	create: withPermission("gitProviders", "create")
		.input(apiCreateGitea)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await createGitea(
					input,
					ctx.session.activeOrganizationId,
					ctx.session.userId,
				);

				await audit(ctx, {
					action: "create",
					resourceType: "gitProvider",
					resourceId: result.giteaId,
					resourceName: input.name,
				});

				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating this Gitea provider",
					cause: error,
				});
			}
		}),

	one: protectedProcedure
		.input(apiFindOneGitea)
		.query(async ({ input, ctx }) => {
			const gitProviderId = await findGiteaGitProviderId(input.giteaId);
			await assertGitProviderAccess(gitProviderId, ctx.session);

			return redactGiteaProvider(await findGiteaById(input.giteaId));
		}),

	giteaProviders: protectedProcedure.query(async ({ ctx }) => {
		const accessibleIds = await getAccessibleGitProviderIds(ctx.session);

		let result = await db.query.gitea.findMany({
			with: {
				gitProvider: true,
			},
		});

		result = result.filter(
			(provider) =>
				provider.gitProvider.organizationId ===
					ctx.session.activeOrganizationId &&
				accessibleIds.has(provider.gitProvider.gitProviderId),
		);

		const filtered = result
			.filter((provider) => haveGiteaRequirements(provider))
			.map((provider) => {
				return {
					giteaId: provider.giteaId,
					gitProvider: {
						...provider.gitProvider,
					},
				};
			});

		return filtered;
	}),

	getGiteaRepositories: protectedProcedure
		.input(apiFindOneGitea)
		.query(async ({ input, ctx }) => {
			const { giteaId } = input;

			if (!giteaId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Gitea provider ID is required.",
				});
			}

			const gitProviderId = await findGiteaGitProviderId(giteaId);
			await assertGitProviderAccess(gitProviderId, ctx.session);
			await assertGitProviderManagementAccess(gitProviderId, ctx.session);

			try {
				const repositories = await getGiteaRepositories(giteaId);
				return repositories;
			} catch (error) {
				console.error("Error fetching Gitea repositories:", error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),

	getGiteaBranches: protectedProcedure
		.input(apiFindGiteaBranches)
		.query(async ({ input, ctx }) => {
			const { giteaId, owner, repositoryName } = input;

			if (!giteaId || !owner || !repositoryName) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Gitea provider ID, owner, and repository name are required.",
				});
			}

			const gitProviderId = await findGiteaGitProviderId(giteaId);
			await assertGitProviderAccess(gitProviderId, ctx.session);

			try {
				return await getGiteaBranches({
					giteaId,
					owner,
					repo: repositoryName,
				});
			} catch (error) {
				console.error("Error fetching Gitea branches:", error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),

	testConnection: protectedProcedure
		.input(apiGiteaTestConnection)
		.mutation(async ({ input, ctx }) => {
			const giteaId = input.giteaId ?? "";

			const gitProviderId = await findGiteaGitProviderId(giteaId);
			await assertGitProviderAccess(gitProviderId, ctx.session);
			await assertGitProviderManagementAccess(gitProviderId, ctx.session);

			try {
				const result = await testGiteaConnection({
					giteaId,
				});

				return `Found ${result} repositories`;
			} catch (error) {
				console.error("Gitea connection test error:", error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),

	update: withPermission("gitProviders", "create")
		.input(apiUpdateGitea)
		.mutation(async ({ input, ctx }) => {
			const gitProviderId = await findGiteaGitProviderId(input.giteaId);
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

				await updateGitea(input.giteaId, {
					...input,
					gitProviderId,
				});
			} else {
				await updateGitea(input.giteaId, {
					...input,
					gitProviderId,
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "gitProvider",
				resourceId: input.giteaId,
				resourceName: input.name,
			});

			return { success: true };
		}),

	getGiteaUrl: protectedProcedure
		.input(apiFindOneGitea)
		.query(async ({ input, ctx }) => {
			const { giteaId } = input;

			if (!giteaId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Gitea provider ID is required.",
				});
			}

			const gitProviderId = await findGiteaGitProviderId(giteaId);
			await assertGitProviderAccess(gitProviderId, ctx.session);

			const giteaProvider = await findGiteaById(giteaId);

			// Return the base URL of the Gitea instance
			return giteaProvider.giteaUrl;
		}),
});

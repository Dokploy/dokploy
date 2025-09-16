import {
	createGithub,
	findGithubById,
	getGithubBranches,
	getGithubRepositories,
	haveGithubRequirements,
	updateGitProvider,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateGithub,
	apiFindGithubBranches,
	apiFindOneGithub,
	apiUpdateGithub,
} from "@/server/db/schema";

export const githubRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateGithub)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createGithub(
					input,
					ctx.session.activeOrganizationId,
					ctx.session.userId,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating this GitHub provider",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneGithub)
		.query(async ({ input, ctx }) => {
			const githubProvider = await findGithubById(input.githubId);
			if (
				githubProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				githubProvider.gitProvider.userId === ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this github provider",
				});
			}
			return githubProvider;
		}),
	getGithubRepositories: protectedProcedure
		.input(apiFindOneGithub)
		.query(async ({ input, ctx }) => {
			const githubProvider = await findGithubById(input.githubId);
			if (
				githubProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				githubProvider.gitProvider.userId === ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this github provider",
				});
			}
			return await getGithubRepositories(input.githubId);
		}),
	getGithubBranches: protectedProcedure
		.input(apiFindGithubBranches)
		.query(async ({ input, ctx }) => {
			const githubProvider = await findGithubById(input.githubId || "");
			if (
				githubProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				githubProvider.gitProvider.userId === ctx.session.userId
			) {
				//TODO: Remove this line when the cloud version is ready
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this github provider",
				});
			}
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
					ctx.session.activeOrganizationId &&
				provider.gitProvider.userId === ctx.session.userId,
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
				const githubProvider = await findGithubById(input.githubId);
				if (
					githubProvider.gitProvider.organizationId !==
						ctx.session.activeOrganizationId &&
					githubProvider.gitProvider.userId === ctx.session.userId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to access this github provider",
					});
				}
				const result = await getGithubRepositories(input.githubId);
				return `Found ${result.length} repositories`;
			} catch (err) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: err instanceof Error ? err?.message : `Error: ${err}`,
				});
			}
		}),
	update: protectedProcedure
		.input(apiUpdateGithub)
		.mutation(async ({ input, ctx }) => {
			const githubProvider = await findGithubById(input.githubId);
			if (
				githubProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				githubProvider.gitProvider.userId === ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this github provider",
				});
			}

			// Update git provider name
			await updateGitProvider(input.gitProviderId, {
				name: input.name,
				organizationId: ctx.session.activeOrganizationId,
			});

			// Update GitHub-specific fields if provided
			const updateData: any = {};
			if (input.githubAppName) updateData.githubAppName = input.githubAppName;
			if (input.githubAppId) updateData.githubAppId = input.githubAppId;
			if (input.githubClientId) updateData.githubClientId = input.githubClientId;
			if (input.githubClientSecret) updateData.githubClientSecret = input.githubClientSecret;
			if (input.githubPrivateKey) updateData.githubPrivateKey = input.githubPrivateKey;
			if (input.githubWebhookSecret) updateData.githubWebhookSecret = input.githubWebhookSecret;

			if (Object.keys(updateData).length > 0) {
				const { updateGithub } = await import("@dokploy/server");
				await updateGithub(input.githubId, updateData);
			}
		}),
});

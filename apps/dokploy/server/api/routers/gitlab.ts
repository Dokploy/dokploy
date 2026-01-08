import {
	createGitlab,
	findGitlabById,
	getGitlabBranches,
	getGitlabRepositories,
	haveGitlabRequirements,
	testGitlabConnection,
	updateGitlab,
	updateGitProvider,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateGitlab,
	apiFindGitlabBranches,
	apiFindOneGitlab,
	apiGitlabTestConnection,
	apiUpdateGitlab,
} from "@/server/db/schema";

export const gitlabRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateGitlab)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createGitlab(
					input,
					ctx.session.activeOrganizationId,
					ctx.session.userId,
				);
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
			const gitlabProvider = await findGitlabById(input.gitlabId);
			if (
				gitlabProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				gitlabProvider.gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this Gitlab provider",
				});
			}
			return gitlabProvider;
		}),
	gitlabProviders: protectedProcedure.query(async ({ ctx }) => {
		let result = await db.query.gitlab.findMany({
			with: {
				gitProvider: true,
			},
		});

		result = result.filter((provider) => {
			return (
				provider.gitProvider.organizationId ===
					ctx.session.activeOrganizationId &&
				provider.gitProvider.userId === ctx.session.userId
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
			const gitlabProvider = await findGitlabById(input.gitlabId);
			if (
				gitlabProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				gitlabProvider.gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this Gitlab provider",
				});
			}
			return await getGitlabRepositories(input.gitlabId);
		}),

	getGitlabBranches: protectedProcedure
		.input(apiFindGitlabBranches)
		.query(async ({ input, ctx }) => {
			const gitlabProvider = await findGitlabById(input.gitlabId || "");
			if (
				gitlabProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				gitlabProvider.gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this Gitlab provider",
				});
			}
			return await getGitlabBranches(input);
		}),
	testConnection: protectedProcedure
		.input(apiGitlabTestConnection)
		.mutation(async ({ input, ctx }) => {
			try {
				const gitlabProvider = await findGitlabById(input.gitlabId || "");
				if (
					gitlabProvider.gitProvider.organizationId !==
						ctx.session.activeOrganizationId &&
					gitlabProvider.gitProvider.userId !== ctx.session.userId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to access this Gitlab provider",
					});
				}
				const result = await testGitlabConnection(input);

				return `Found ${result} repositories`;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error?.message : `Error: ${error}`,
				});
			}
		}),
	update: protectedProcedure
		.input(apiUpdateGitlab)
		.mutation(async ({ input, ctx }) => {
			const gitlabProvider = await findGitlabById(input.gitlabId);
			if (
				gitlabProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				gitlabProvider.gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this Gitlab provider",
				});
			}
			if (input.name) {
				await updateGitProvider(input.gitProviderId, {
					name: input.name,
					organizationId: ctx.session.activeOrganizationId,
				});

				await updateGitlab(input.gitlabId, {
					...input,
				});
			} else {
				await updateGitlab(input.gitlabId, {
					...input,
				});
			}
		}),
});

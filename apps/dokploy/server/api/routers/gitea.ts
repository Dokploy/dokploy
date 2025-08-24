import {
	createGitea,
	findGiteaById,
	getGiteaBranches,
	getGiteaRepositories,
	haveGiteaRequirements,
	testGiteaConnection,
	updateGitea,
	updateGitProvider,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateGitea,
	apiFindGiteaBranches,
	apiFindOneGitea,
	apiGiteaTestConnection,
	apiUpdateGitea,
} from "@/server/db/schema";

export const giteaRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateGitea)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createGitea(
					input,
					ctx.session.activeOrganizationId,
					ctx.session.userId,
				);
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
			const giteaProvider = await findGiteaById(input.giteaId);
			if (
				giteaProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				giteaProvider.gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this Gitea provider",
				});
			}
			return giteaProvider;
		}),

	giteaProviders: protectedProcedure.query(async ({ ctx }: { ctx: any }) => {
		let result = await db.query.gitea.findMany({
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

			const giteaProvider = await findGiteaById(giteaId);
			if (
				giteaProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				giteaProvider.gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this Gitea provider",
				});
			}

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

			const giteaProvider = await findGiteaById(giteaId);
			if (
				giteaProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				giteaProvider.gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this Gitea provider",
				});
			}

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

			try {
				const giteaProvider = await findGiteaById(giteaId);
				if (
					giteaProvider.gitProvider.organizationId !==
						ctx.session.activeOrganizationId &&
					giteaProvider.gitProvider.userId !== ctx.session.userId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to access this Gitea provider",
					});
				}

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

	update: protectedProcedure
		.input(apiUpdateGitea)
		.mutation(async ({ input, ctx }) => {
			const giteaProvider = await findGiteaById(input.giteaId);
			if (
				giteaProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				giteaProvider.gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this Gitea provider",
				});
			}

			if (input.name) {
				await updateGitProvider(input.gitProviderId, {
					name: input.name,
					organizationId: ctx.session.activeOrganizationId,
				});

				await updateGitea(input.giteaId, {
					...input,
				});
			} else {
				await updateGitea(input.giteaId, {
					...input,
				});
			}

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

			const giteaProvider = await findGiteaById(giteaId);
			if (
				giteaProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				giteaProvider.gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this Gitea provider",
				});
			}

			// Return the base URL of the Gitea instance
			return giteaProvider.giteaUrl;
		}),
});

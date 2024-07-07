import {
	apiAssignPermissions,
	apiCreateUserInvitation,
	apiFindOneToken,
	apiGetBranches,
	apiRemoveUser,
	users,
} from "@/server/db/schema";
import {
	createInvitation,
	findAdmin,
	getUserByToken,
	removeUserByAuthId,
	updateAdmin,
} from "../services/admin";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "../trpc";
import { db } from "@/server/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";
import { haveGithubRequirements } from "@/server/utils/providers/github";

export const adminRouter = createTRPCRouter({
	one: adminProcedure.query(async () => {
		const { sshPrivateKey, ...rest } = await findAdmin();
		return {
			haveSSH: !!sshPrivateKey,
			...rest,
		};
	}),
	createUserInvitation: adminProcedure
		.input(apiCreateUserInvitation)
		.mutation(async ({ input }) => {
			try {
				await createInvitation(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Error to create this user\ncheck if the email is not registered",
					cause: error,
				});
			}
		}),
	removeUser: adminProcedure
		.input(apiRemoveUser)
		.mutation(async ({ input }) => {
			try {
				return await removeUserByAuthId(input.authId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to delete this user",
					cause: error,
				});
			}
		}),
	getUserByToken: publicProcedure
		.input(apiFindOneToken)
		.query(async ({ input }) => {
			return await getUserByToken(input.token);
		}),
	assignPermissions: adminProcedure
		.input(apiAssignPermissions)
		.mutation(async ({ input }) => {
			try {
				await db
					.update(users)
					.set({
						...input,
					})
					.where(eq(users.userId, input.userId));
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to assign permissions",
				});
			}
		}),

	cleanGithubApp: adminProcedure.mutation(async ({ ctx }) => {
		try {
			return await updateAdmin(ctx.user.authId, {
				githubAppName: "",
				githubClientId: "",
				githubClientSecret: "",
				githubInstallationId: "",
			});
		} catch (error) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error to delete this github app",
				cause: error,
			});
		}
	}),

	getRepositories: protectedProcedure.query(async () => {
		const admin = await findAdmin();

		const completeRequirements = haveGithubRequirements(admin);

		if (!completeRequirements) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Admin need to setup correctly github account",
			});
		}

		const octokit = new Octokit({
			authStrategy: createAppAuth,
			auth: {
				appId: admin.githubAppId,
				privateKey: admin.githubPrivateKey,
				installationId: admin.githubInstallationId,
			},
		});

		const repositories = (await octokit.paginate(
			octokit.rest.apps.listReposAccessibleToInstallation,
		)) as unknown as Awaited<
			ReturnType<typeof octokit.rest.apps.listReposAccessibleToInstallation>
		>["data"]["repositories"];

		return repositories;
	}),
	getBranches: protectedProcedure
		.input(apiGetBranches)
		.query(async ({ input }) => {
			const admin = await findAdmin();

			const completeRequirements = haveGithubRequirements(admin);

			if (!completeRequirements) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Admin need to setup correctly github account",
				});
			}

			const octokit = new Octokit({
				authStrategy: createAppAuth,
				auth: {
					appId: admin.githubAppId,
					privateKey: admin.githubPrivateKey,
					installationId: admin.githubInstallationId,
				},
			});

			const branches = (await octokit.paginate(
				octokit.rest.repos.listBranches,
				{
					owner: input.owner,
					repo: input.repo,
				},
			)) as unknown as Awaited<
				ReturnType<typeof octokit.rest.repos.listBranches>
			>["data"];

			return branches;
		}),
	haveGithubConfigured: protectedProcedure.query(async () => {
		const adminResponse = await findAdmin();

		return haveGithubRequirements(adminResponse);
	}),
});

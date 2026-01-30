import {
	checkServiceAccess,
	cleanPatchRepos,
	createPatch,
	deletePatch,
	ensurePatchRepo,
	findApplicationById,
	findComposeById,
	findPatchById,
	findPatchesByApplicationId,
	findPatchesByComposeId,
	findPatchByFilePath,
	generatePatch,
	readPatchRepoDirectory,
	readPatchRepoFile,
	updatePatch,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import {
	apiCreatePatch,
	apiDeletePatch,
	apiFindPatch,
	apiFindPatchesByApplicationId,
	apiFindPatchesByComposeId,
	apiTogglePatchEnabled,
	apiUpdatePatch,
} from "@/server/db/schema";

// Helper to get git config from application
const getApplicationGitConfig = (app: Awaited<ReturnType<typeof findApplicationById>>) => {
	switch (app.sourceType) {
		case "github":
			return {
				gitUrl: `https://github.com/${app.owner}/${app.repository}.git`,
				gitBranch: app.branch || "main",
				sshKeyId: null,
			};
		case "gitlab":
			return {
				gitUrl: `https://gitlab.com/${app.gitlabOwner}/${app.gitlabRepository}.git`,
				gitBranch: app.gitlabBranch || "main",
				sshKeyId: null,
			};
		case "gitea":
			return {
				gitUrl: app.gitea?.gitUrl
					? `${app.gitea.gitUrl}/${app.giteaOwner}/${app.giteaRepository}.git`
					: "",
				gitBranch: app.giteaBranch || "main",
				sshKeyId: null,
			};
		case "bitbucket":
			return {
				gitUrl: `https://bitbucket.org/${app.bitbucketOwner}/${app.bitbucketRepository}.git`,
				gitBranch: app.bitbucketBranch || "main",
				sshKeyId: null,
			};
		case "git":
			return {
				gitUrl: app.customGitUrl || "",
				gitBranch: app.customGitBranch || "main",
				sshKeyId: app.customGitSSHKeyId,
			};
		default:
			return null;
	}
};

// Helper to get git config from compose
const getComposeGitConfig = (compose: Awaited<ReturnType<typeof findComposeById>>) => {
	switch (compose.sourceType) {
		case "github":
			return {
				gitUrl: `https://github.com/${compose.owner}/${compose.repository}.git`,
				gitBranch: compose.branch || "main",
				sshKeyId: null,
			};
		case "gitlab":
			return {
				gitUrl: `https://gitlab.com/${compose.gitlabOwner}/${compose.gitlabRepository}.git`,
				gitBranch: compose.gitlabBranch || "main",
				sshKeyId: null,
			};
		case "gitea":
			return {
				gitUrl: compose.gitea?.gitUrl
					? `${compose.gitea.gitUrl}/${compose.giteaOwner}/${compose.giteaRepository}.git`
					: "",
				gitBranch: compose.giteaBranch || "main",
				sshKeyId: null,
			};
		case "bitbucket":
			return {
				gitUrl: `https://bitbucket.org/${compose.bitbucketOwner}/${compose.bitbucketRepository}.git`,
				gitBranch: compose.bitbucketBranch || "main",
				sshKeyId: null,
			};
		case "git":
			return {
				gitUrl: compose.customGitUrl || "",
				gitBranch: compose.customGitBranch || "main",
				sshKeyId: compose.customGitSSHKeyId,
			};
		default:
			return null;
	}
};

export const patchRouter = createTRPCRouter({
	// CRUD Operations
	create: protectedProcedure
		.input(apiCreatePatch)
		.mutation(async ({ input, ctx }) => {
			// Verify access
			if (input.applicationId) {
				const app = await findApplicationById(input.applicationId);
				if (
					app.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this application",
					});
				}
				if (ctx.user.role === "member") {
					await checkServiceAccess(
						ctx.user.id,
						input.applicationId,
						ctx.session.activeOrganizationId,
						"access",
					);
				}
			} else if (input.composeId) {
				const compose = await findComposeById(input.composeId);
				if (
					compose.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this compose",
					});
				}
			}

			return await createPatch(input);
		}),

	one: protectedProcedure
		.input(apiFindPatch)
		.query(async ({ input }) => {
			return await findPatchById(input.patchId);
		}),

	byApplicationId: protectedProcedure
		.input(apiFindPatchesByApplicationId)
		.query(async ({ input, ctx }) => {
			const app = await findApplicationById(input.applicationId);
			if (
				app.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}

			return await findPatchesByApplicationId(input.applicationId);
		}),

	byComposeId: protectedProcedure
		.input(apiFindPatchesByComposeId)
		.query(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (
				compose.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this compose",
				});
			}

			return await findPatchesByComposeId(input.composeId);
		}),

	update: protectedProcedure
		.input(apiUpdatePatch)
		.mutation(async ({ input }) => {
			const { patchId, ...data } = input;
			return await updatePatch(patchId, data);
		}),

	delete: protectedProcedure
		.input(apiDeletePatch)
		.mutation(async ({ input }) => {
			return await deletePatch(input.patchId);
		}),

	toggleEnabled: protectedProcedure
		.input(apiTogglePatchEnabled)
		.mutation(async ({ input }) => {
			return await updatePatch(input.patchId, { enabled: input.enabled });
		}),

	// Repository Operations
	ensureRepo: protectedProcedure
		.input(
			z.object({
				applicationId: z.string().optional(),
				composeId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (input.applicationId) {
				const app = await findApplicationById(input.applicationId);
				if (
					app.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this application",
					});
				}

				const gitConfig = getApplicationGitConfig(app);
				if (!gitConfig || !gitConfig.gitUrl) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Application does not have a git source configured",
					});
				}

				return await ensurePatchRepo({
					appName: app.appName,
					type: "application",
					gitUrl: gitConfig.gitUrl,
					gitBranch: gitConfig.gitBranch,
					sshKeyId: gitConfig.sshKeyId,
					serverId: app.serverId,
				});
			}

			if (input.composeId) {
				const compose = await findComposeById(input.composeId);
				if (
					compose.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this compose",
					});
				}

				const gitConfig = getComposeGitConfig(compose);
				if (!gitConfig || !gitConfig.gitUrl) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Compose does not have a git source configured",
					});
				}

				return await ensurePatchRepo({
					appName: compose.appName,
					type: "compose",
					gitUrl: gitConfig.gitUrl,
					gitBranch: gitConfig.gitBranch,
					sshKeyId: gitConfig.sshKeyId,
					serverId: compose.serverId,
				});
			}

			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Either applicationId or composeId must be provided",
			});
		}),

	readRepoDirectories: protectedProcedure
		.input(
			z.object({
				applicationId: z.string().optional(),
				composeId: z.string().optional(),
				repoPath: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			if (input.applicationId) {
				const app = await findApplicationById(input.applicationId);
				if (
					app.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this application",
					});
				}
				return await readPatchRepoDirectory(input.repoPath, app.serverId);
			}

			if (input.composeId) {
				const compose = await findComposeById(input.composeId);
				if (
					compose.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this compose",
					});
				}
				return await readPatchRepoDirectory(input.repoPath, compose.serverId);
			}

			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Either applicationId or composeId must be provided",
			});
		}),

	readRepoFile: protectedProcedure
		.input(
			z.object({
				applicationId: z.string().optional(),
				composeId: z.string().optional(),
				repoPath: z.string(),
				filePath: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			let serverId: string | null = null;
			let patchContent: string | undefined;

			if (input.applicationId) {
				const app = await findApplicationById(input.applicationId);
				if (
					app.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this application",
					});
				}
				serverId = app.serverId;

				// Check if patch exists for this file
				const existingPatch = await findPatchByFilePath(
					input.filePath,
					input.applicationId,
					undefined,
				);
				if (existingPatch?.enabled) {
					patchContent = existingPatch.content;
				}
			} else if (input.composeId) {
				const compose = await findComposeById(input.composeId);
				if (
					compose.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this compose",
					});
				}
				serverId = compose.serverId;

				// Check if patch exists for this file
				const existingPatch = await findPatchByFilePath(
					input.filePath,
					undefined,
					input.composeId,
				);
				if (existingPatch?.enabled) {
					patchContent = existingPatch.content;
				}
			} else {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Either applicationId or composeId must be provided",
				});
			}

			return await readPatchRepoFile(
				input.repoPath,
				input.filePath,
				patchContent,
				serverId,
			);
		}),

	saveFileAsPatch: protectedProcedure
		.input(
			z.object({
				applicationId: z.string().optional(),
				composeId: z.string().optional(),
				repoPath: z.string(),
				filePath: z.string(),
				content: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			let serverId: string | null = null;

			if (input.applicationId) {
				const app = await findApplicationById(input.applicationId);
				if (
					app.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this application",
					});
				}
				serverId = app.serverId;
			} else if (input.composeId) {
				const compose = await findComposeById(input.composeId);
				if (
					compose.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this compose",
					});
				}
				serverId = compose.serverId;
			} else {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Either applicationId or composeId must be provided",
				});
			}

			// Generate patch diff
			const patchContent = await generatePatch({
				codePath: input.repoPath,
				filePath: input.filePath,
				newContent: input.content,
				serverId,
			});

			if (!patchContent.trim()) {
				// No changes - remove existing patch if any
				const existingPatch = await findPatchByFilePath(
					input.filePath,
					input.applicationId,
					input.composeId,
				);
				if (existingPatch) {
					await deletePatch(existingPatch.patchId);
				}
				return { deleted: true, patchId: null };
			}

			// Check if patch exists
			const existingPatch = await findPatchByFilePath(
				input.filePath,
				input.applicationId,
				input.composeId,
			);

			if (existingPatch) {
				// Update existing patch
				await updatePatch(existingPatch.patchId, { content: patchContent });
				return { deleted: false, patchId: existingPatch.patchId };
			}

			// Create new patch
			const newPatch = await createPatch({
				filePath: input.filePath,
				content: patchContent,
				enabled: true,
				applicationId: input.applicationId,
				composeId: input.composeId,
			});

			return { deleted: false, patchId: newPatch.patchId };
		}),

	// Cleanup
	cleanPatchRepos: adminProcedure
		.input(z.object({ serverId: z.string().optional() }))
		.mutation(async ({ input }) => {
			await cleanPatchRepos(input.serverId);
			return true;
		}),
});

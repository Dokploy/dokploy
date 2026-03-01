import {
	checkServiceAccess,
	cleanPatchRepos,
	createPatch,
	deletePatch,
	ensurePatchRepo,
	findApplicationById,
	findComposeById,
	findPatchByFilePath,
	findPatchById,
	findPatchesByEntityId,
	markPatchForDeletion,
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
	apiTogglePatchEnabled,
	apiUpdatePatch,
} from "@/server/db/schema";

export const patchRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreatePatch)
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

	one: protectedProcedure.input(apiFindPatch).query(async ({ input }) => {
		return await findPatchById(input.patchId);
	}),

	byEntityId: protectedProcedure
		.input(
			z.object({ id: z.string(), type: z.enum(["application", "compose"]) }),
		)
		.query(async ({ input, ctx }) => {
			if (input.type === "application") {
				const app = await findApplicationById(input.id);
				if (
					app.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this application",
					});
				}
			} else if (input.type === "compose") {
				const compose = await findComposeById(input.id);
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
			const result = await findPatchesByEntityId(input.id, input.type);

			return result;
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
				id: z.string(),
				type: z.enum(["application", "compose"]),
			}),
		)
		.mutation(async ({ input }) => {
			return await ensurePatchRepo({
				type: input.type,
				id: input.id,
			});
		}),

	readRepoDirectories: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				type: z.enum(["application", "compose"]),
				repoPath: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			let serverId: string | null = null;

			if (input.type === "application") {
				const app = await findApplicationById(input.id);
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
			}

			if (input.type === "compose") {
				const compose = await findComposeById(input.id);
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
			}

			return await readPatchRepoDirectory(input.repoPath, serverId);
		}),

	readRepoFile: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				type: z.enum(["application", "compose"]),
				filePath: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			let serverId: string | null = null;

			if (input.type === "application") {
				const app = await findApplicationById(input.id);
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
			} else if (input.type === "compose") {
				const compose = await findComposeById(input.id);
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
			const existingPatch = await findPatchByFilePath(
				input.filePath,
				input.id,
				input.type,
			);

			// For delete patches, show current file content from repo (what will be deleted)
			if (existingPatch?.type === "delete") {
				try {
					return await readPatchRepoFile(input.id, input.type, input.filePath);
				} catch {
					return "(File not found in repo - will be removed if it exists)";
				}
			}
			if (existingPatch?.content) {
				return existingPatch.content;
			}
			return await readPatchRepoFile(input.id, input.type, input.filePath);
		}),

	saveFileAsPatch: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				type: z.enum(["application", "compose"]),
				filePath: z.string(),
				content: z.string(),
				patchType: z.enum(["create", "update"]).default("update"),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (input.type === "application") {
				const app = await findApplicationById(input.id);
				if (
					app.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this application",
					});
				}
			} else if (input.type === "compose") {
				const compose = await findComposeById(input.id);
				if (
					compose.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this compose",
					});
				}
			} else {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Either application or compose must be provided",
				});
			}

			const existingPatch = await findPatchByFilePath(
				input.filePath,
				input.id,
				input.type,
			);

			if (!existingPatch) {
				return await createPatch({
					filePath: input.filePath,
					content: input.content,
					type: input.patchType,
					applicationId: input.type === "application" ? input.id : undefined,
					composeId: input.type === "compose" ? input.id : undefined,
				});
			}

			return await updatePatch(existingPatch.patchId, {
				content: input.content,
				type: input.patchType,
			});
		}),

	markFileForDeletion: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				type: z.enum(["application", "compose"]),
				filePath: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (input.type === "application") {
				const app = await findApplicationById(input.id);
				if (
					app.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this application",
					});
				}
			} else if (input.type === "compose") {
				const compose = await findComposeById(input.id);
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

			return await markPatchForDeletion(input.filePath, input.id, input.type);
		}),
	cleanPatchRepos: adminProcedure
		.input(z.object({ serverId: z.string().optional() }))
		.mutation(async ({ input }) => {
			await cleanPatchRepos(input.serverId);
			return true;
		}),
});

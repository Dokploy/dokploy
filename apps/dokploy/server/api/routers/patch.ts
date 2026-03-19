import {
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
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreatePatch,
	apiDeletePatch,
	apiFindPatch,
	apiTogglePatchEnabled,
	apiUpdatePatch,
} from "@/server/db/schema";

/**
 * Resolves the serviceId from a patch record (applicationId or composeId).
 * Throws if neither is set.
 */
const resolvePatchServiceId = (patch: {
	applicationId: string | null;
	composeId: string | null;
}): string => {
	const serviceId = patch.applicationId ?? patch.composeId;
	if (!serviceId) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Patch has no associated service",
		});
	}
	return serviceId;
};

export const patchRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreatePatch)
		.mutation(async ({ input, ctx }) => {
			const serviceId = input.applicationId ?? input.composeId;
			if (!serviceId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Either applicationId or composeId must be provided",
				});
			}
			await checkServicePermissionAndAccess(ctx, serviceId, {
				service: ["create"],
			});
			const result = await createPatch(input);
			await audit(ctx, {
				action: "create",
				resourceType: "settings",
				resourceId: result.patchId,
				resourceName: result.filePath,
				metadata: { type: "patch" },
			});
			return result;
		}),

	one: protectedProcedure.input(apiFindPatch).query(async ({ input, ctx }) => {
		const patch = await findPatchById(input.patchId);
		const serviceId = resolvePatchServiceId(patch);
		await checkServicePermissionAndAccess(ctx, serviceId, {
			service: ["read"],
		});
		return patch;
	}),

	byEntityId: protectedProcedure
		.input(
			z.object({ id: z.string(), type: z.enum(["application", "compose"]) }),
		)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.id, {
				service: ["read"],
			});
			return await findPatchesByEntityId(input.id, input.type);
		}),

	update: protectedProcedure
		.input(apiUpdatePatch)
		.mutation(async ({ input, ctx }) => {
			const patch = await findPatchById(input.patchId);
			const serviceId = resolvePatchServiceId(patch);
			await checkServicePermissionAndAccess(ctx, serviceId, {
				service: ["create"],
			});
			const { patchId, ...data } = input;
			const result = await updatePatch(patchId, data);
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceId: patchId,
				resourceName: patch.filePath,
				metadata: { type: "patch" },
			});
			return result;
		}),

	delete: protectedProcedure
		.input(apiDeletePatch)
		.mutation(async ({ input, ctx }) => {
			const patch = await findPatchById(input.patchId);
			const serviceId = resolvePatchServiceId(patch);
			await checkServicePermissionAndAccess(ctx, serviceId, {
				service: ["delete"],
			});
			const result = await deletePatch(input.patchId);
			await audit(ctx, {
				action: "delete",
				resourceType: "settings",
				resourceId: input.patchId,
				resourceName: patch.filePath,
				metadata: { type: "patch" },
			});
			return result;
		}),

	toggleEnabled: protectedProcedure
		.input(apiTogglePatchEnabled)
		.mutation(async ({ input, ctx }) => {
			const patch = await findPatchById(input.patchId);
			const serviceId = resolvePatchServiceId(patch);
			await checkServicePermissionAndAccess(ctx, serviceId, {
				service: ["create"],
			});
			const result = await updatePatch(input.patchId, {
				enabled: input.enabled,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceId: input.patchId,
				resourceName: patch.filePath,
				metadata: { type: "patch", enabled: input.enabled },
			});
			return result;
		}),

	// Repository Operations
	ensureRepo: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				type: z.enum(["application", "compose"]),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.id, {
				service: ["create"],
			});
			const result = await ensurePatchRepo({
				type: input.type,
				id: input.id,
			});
			await audit(ctx, {
				action: "create",
				resourceType: "settings",
				resourceId: input.id,
				metadata: { type: "ensurePatchRepo", serviceType: input.type },
			});
			return result;
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
			await checkServicePermissionAndAccess(ctx, input.id, {
				service: ["read"],
			});
			let serverId: string | null = null;
			if (input.type === "application") {
				const app = await findApplicationById(input.id);
				serverId = app.serverId;
			} else {
				const compose = await findComposeById(input.id);
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
			await checkServicePermissionAndAccess(ctx, input.id, {
				service: ["read"],
			});
			let serverId: string | null = null;
			if (input.type === "application") {
				const app = await findApplicationById(input.id);
				serverId = app.serverId;
			} else {
				const compose = await findComposeById(input.id);
				serverId = compose.serverId;
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
			await checkServicePermissionAndAccess(ctx, input.id, {
				service: ["create"],
			});
			const existingPatch = await findPatchByFilePath(
				input.filePath,
				input.id,
				input.type,
			);
			if (!existingPatch) {
				const result = await createPatch({
					filePath: input.filePath,
					content: input.content,
					type: input.patchType,
					applicationId: input.type === "application" ? input.id : undefined,
					composeId: input.type === "compose" ? input.id : undefined,
				});
				await audit(ctx, {
					action: "create",
					resourceType: "settings",
					resourceId: result.patchId,
					resourceName: input.filePath,
					metadata: { type: "saveFileAsPatch" },
				});
				return result;
			}
			const result = await updatePatch(existingPatch.patchId, {
				content: input.content,
				type: input.patchType,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceId: existingPatch.patchId,
				resourceName: input.filePath,
				metadata: { type: "saveFileAsPatch" },
			});
			return result;
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
			await checkServicePermissionAndAccess(ctx, input.id, {
				service: ["create"],
			});
			const result = await markPatchForDeletion(
				input.filePath,
				input.id,
				input.type,
			);
			await audit(ctx, {
				action: "delete",
				resourceType: "settings",
				resourceId: input.id,
				resourceName: input.filePath,
				metadata: { type: "markFileForDeletion" },
			});
			return result;
		}),

	cleanPatchRepos: adminProcedure
		.input(z.object({ serverId: z.string().optional() }))
		.mutation(async ({ input, ctx }) => {
			await cleanPatchRepos(input.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "settings",
				resourceId: input.serverId || "local",
				metadata: { type: "cleanPatchRepos" },
			});
			return true;
		}),
});

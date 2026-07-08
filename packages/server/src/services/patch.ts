import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { type apiCreatePatch, patch } from "@dokploy/server/db/schema";
import {
	getNoSymlinkFilePathGuardCommand,
	normalizeRelativeFilePath,
	quoteShellArg,
	resolveFilePathInsideDirectory,
} from "@dokploy/server/utils/filesystem/safe-path";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { encodeBase64 } from "../utils/docker/utils";
import { findApplicationById } from "./application";
import { findComposeById } from "./compose";

export type Patch = typeof patch.$inferSelect;

const normalizePatchFilePath = (filePath: string) => {
	try {
		return normalizeRelativeFilePath(filePath);
	} catch {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid patch file path",
		});
	}
};

export const createPatch = async (input: z.infer<typeof apiCreatePatch>) => {
	const selectedIds = [input.applicationId, input.composeId].filter(Boolean);
	if (selectedIds.length !== 1) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Exactly one of applicationId or composeId must be provided",
		});
	}

	const newPatch = await db
		.insert(patch)
		.values({
			...input,
			filePath: normalizePatchFilePath(input.filePath),
			content: input.content,
			enabled: true,
		})
		.returning()
		.then((value) => value[0]);

	if (!newPatch) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the patch",
		});
	}

	return newPatch;
};

export const findPatchById = async (patchId: string) => {
	const result = await db.query.patch.findFirst({
		where: eq(patch.patchId, patchId),
	});

	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Patch not found",
		});
	}

	return result;
};

export const findPatchesByEntityId = async (
	id: string,
	type: "application" | "compose",
) => {
	return await db.query.patch.findMany({
		where: eq(
			type === "application" ? patch.applicationId : patch.composeId,
			id,
		),
		orderBy: (patch, { asc }) => [asc(patch.filePath)],
	});
};

export const findPatchByFilePath = async (
	filePath: string,
	id: string,
	type: "application" | "compose",
) => {
	const normalizedFilePath = normalizePatchFilePath(filePath);
	return await db.query.patch.findFirst({
		where: and(
			eq(patch.filePath, normalizedFilePath),
			eq(type === "application" ? patch.applicationId : patch.composeId, id),
		),
	});
};

export const updatePatch = async (patchId: string, data: Partial<Patch>) => {
	const normalizedData = {
		...data,
		...(data.filePath && {
			filePath: normalizePatchFilePath(data.filePath),
		}),
	};
	const result = await db
		.update(patch)
		.set({
			...normalizedData,
			...(normalizedData.content && {
				content: normalizedData.content.endsWith("\n")
					? normalizedData.content
					: `${normalizedData.content}\n`,
			}),
			updatedAt: new Date().toISOString(),
		})
		.where(eq(patch.patchId, patchId))
		.returning();

	return result[0];
};

export const deletePatch = async (patchId: string) => {
	const result = await db
		.delete(patch)
		.where(eq(patch.patchId, patchId))
		.returning();

	return result[0];
};

export const markPatchForDeletion = async (
	filePath: string,
	entityId: string,
	entityType: "application" | "compose",
) => {
	const normalizedFilePath = normalizePatchFilePath(filePath);
	const existing = await findPatchByFilePath(
		normalizedFilePath,
		entityId,
		entityType,
	);

	if (existing) {
		return await updatePatch(existing.patchId, { type: "delete", content: "" });
	}

	return await createPatch({
		filePath: normalizedFilePath,
		content: "",
		type: "delete",
		applicationId: entityType === "application" ? entityId : undefined,
		composeId: entityType === "compose" ? entityId : undefined,
	});
};

interface ApplyPatchesOptions {
	id: string;
	type: "application" | "compose";
	serverId: string | null;
}

export const generateApplyPatchesCommand = async ({
	id,
	type,
	serverId,
}: ApplyPatchesOptions) => {
	const entity =
		type === "application"
			? await findApplicationById(id)
			: await findComposeById(id);
	const { COMPOSE_PATH, APPLICATIONS_PATH } = paths(!!serverId);
	const basePath = type === "compose" ? COMPOSE_PATH : APPLICATIONS_PATH;
	const codePath = join(basePath, entity.appName, "code");

	const resultPatches = await findPatchesByEntityId(id, type);
	const patches = resultPatches.filter((p) => p.enabled);

	if (patches.length === 0) {
		return "";
	}

	let command = `echo "Applying ${patches.length} patch(es)...";`;

	for (const p of patches) {
		const { fullPath: filePath } = resolveFilePathInsideDirectory(
			codePath,
			p.filePath,
		);
		const quotedFilePath = quoteShellArg(filePath);

		if (p.type === "delete") {
			const symlinkGuard = getNoSymlinkFilePathGuardCommand(
				codePath,
				filePath,
				{
					createParent: false,
				},
			);
			command += `
			${symlinkGuard}
			rm -f -- ${quotedFilePath};
			`;
		} else {
			const symlinkGuard = getNoSymlinkFilePathGuardCommand(codePath, filePath);
			command += `
${symlinkGuard}
file=${quotedFilePath}
dir="$(dirname "$file")"
mkdir -p "$dir"
tmp="$(mktemp "$dir/.dokploy-patch.XXXXXX")"
echo "${encodeBase64(p.content)}" | base64 -d > "$tmp"
mv -f "$tmp" "$file"
`;
		}
	}

	return command;
};

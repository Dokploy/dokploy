import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { type apiCreatePatch, patch } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { encodeBase64 } from "../utils/docker/utils";
import { findApplicationById } from "./application";
import { findComposeById } from "./compose";

export type Patch = typeof patch.$inferSelect;

export const createPatch = async (input: typeof apiCreatePatch._type) => {
	if (!input.applicationId && !input.composeId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Either applicationId or composeId must be provided",
		});
	}

	const newPatch = await db
		.insert(patch)
		.values({
			...input,
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
	return await db.query.patch.findFirst({
		where: and(
			eq(patch.filePath, filePath),
			eq(type === "application" ? patch.applicationId : patch.composeId, id),
		),
	});
};

export const updatePatch = async (patchId: string, data: Partial<Patch>) => {
	const result = await db
		.update(patch)
		.set({
			...data,
			...(data.content && {
				content: data.content.endsWith("\n")
					? data.content
					: `${data.content}\n`,
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
	const existing = await findPatchByFilePath(filePath, entityId, entityType);

	if (existing) {
		return await updatePatch(existing.patchId, { type: "delete", content: "" });
	}

	return await createPatch({
		filePath,
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

	let command = `echo "Applying ${patches.length} patch(es)...";`;

	for (const p of patches) {
		const filePath = join(codePath, p.filePath);

		if (p.type === "delete") {
			command += `
			rm -f "${filePath}";
			`;
		} else {
			command += `
file="${filePath}"
dir="$(dirname "$file")"
mkdir -p "$dir"
echo "${encodeBase64(p.content)}" | base64 -d > "$file"
`;
		}
	}

	return command;
};

import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreatePatch,
	patch,
} from "@dokploy/server/db/schema";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";

export type Patch = typeof patch.$inferSelect;

// CRUD Operations

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
			content: input.content.endsWith("\n")
				? input.content
				: `${input.content}\n`,
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

export const findPatchesByApplicationId = async (applicationId: string) => {
	return await db.query.patch.findMany({
		where: and(
			eq(patch.applicationId, applicationId),
			isNotNull(patch.applicationId),
		),
		orderBy: (patch, { asc }) => [asc(patch.filePath)],
	});
};

export const findPatchesByComposeId = async (composeId: string) => {
	return await db.query.patch.findMany({
		where: and(eq(patch.composeId, composeId), isNotNull(patch.composeId)),
		orderBy: (patch, { asc }) => [asc(patch.filePath)],
	});
};

export const findPatchByFilePath = async (
	filePath: string,
	applicationId?: string,
	composeId?: string,
) => {
	if (applicationId) {
		return await db.query.patch.findFirst({
			where: and(
				eq(patch.filePath, filePath),
				eq(patch.applicationId, applicationId),
			),
		});
	}
	if (composeId) {
		return await db.query.patch.findFirst({
			where: and(eq(patch.filePath, filePath), eq(patch.composeId, composeId)),
		});
	}
	return null;
};

export const updatePatch = async (
	patchId: string,
	data: Partial<Patch>,
) => {
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

// Patch Application Functions

interface ApplyPatchesOptions {
	appName: string;
	type: "application" | "compose";
	serverId: string | null;
	patches: Patch[];
}

/**
 * Generate shell commands to apply patches to cloned repository
 * Uses git apply to apply unified diff patches
 */
export const generateApplyPatchesCommand = ({
	appName,
	type,
	patches,
	serverId,
}: ApplyPatchesOptions): string => {
	if (patches.length === 0) {
		return "";
	}

	const { COMPOSE_PATH, APPLICATIONS_PATH } = paths(!!serverId);
	const basePath = type === "compose" ? COMPOSE_PATH : APPLICATIONS_PATH;
	const codePath = join(basePath, appName, "code");

	let command = `echo "Applying ${patches.length} patch(es)...";`;

	for (const p of patches) {
		// Create a temporary patch file and apply it
		const patchFileName = `/tmp/patch_${p.patchId}.patch`;
		// Escape content for shell - use base64 encoding
		const encodedContent = Buffer.from(p.content).toString("base64");

		command += `
echo "${encodedContent}" | base64 -d > ${patchFileName};
cd ${codePath} && git apply --whitespace=fix ${patchFileName} && echo "✅ Applied patch for: ${p.filePath}" || echo "⚠️ Warning: Failed to apply patch for: ${p.filePath}";
rm -f ${patchFileName};
`;
	}

	return command;
};

/**
 * Apply patches during build process
 */
export const applyPatches = async ({
	appName,
	type,
	serverId,
	patches,
}: ApplyPatchesOptions): Promise<void> => {
	const enabledPatches = patches.filter((p) => p.enabled);

	if (enabledPatches.length === 0) {
		return;
	}

	const command = generateApplyPatchesCommand({
		appName,
		type,
		serverId,
		patches: enabledPatches,
	});

	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};

interface GeneratePatchOptions {
	codePath: string;
	filePath: string;
	newContent: string;
	serverId?: string | null;
}

/**
 * Generate a patch from modified file content using git diff
 */
export const generatePatch = async ({
	codePath,
	filePath,
	newContent,
	serverId,
}: GeneratePatchOptions): Promise<string> => {
	const fullPath = join(codePath, filePath);

	// Write new content to the file
	const encodedContent = Buffer.from(newContent).toString("base64");
	const writeCommand = `echo "${encodedContent}" | base64 -d > "${fullPath}"`;

	if (serverId) {
		await execAsyncRemote(serverId, writeCommand);
	} else {
		await execAsync(writeCommand);
	}

	// Generate diff
	const diffCommand = `cd "${codePath}" && git diff -- "${filePath}"`;

	let diffResult: string;
	if (serverId) {
		const result = await execAsyncRemote(serverId, diffCommand);
		diffResult = result.stdout;
	} else {
		const result = await execAsync(diffCommand);
		diffResult = result.stdout;
	}

	// Reset the file to original state
	const resetCommand = `cd "${codePath}" && git checkout -- "${filePath}"`;
	if (serverId) {
		await execAsyncRemote(serverId, resetCommand);
	} else {
		await execAsync(resetCommand);
	}

	return diffResult;
};

interface ApplyPatchToContentOptions {
	originalContent: string;
	patchContent: string;
}

/**
 * Apply a patch to content in memory (for preview purposes)
 * Returns the patched content or throws an error if patch fails
 */
export const applyPatchToContent = async ({
	originalContent,
	patchContent,
}: ApplyPatchToContentOptions): Promise<string> => {
	// Create temp files and apply patch
	const tempDir = "/tmp/patch_preview_" + Date.now();
	const tempFile = `${tempDir}/file`;
	const patchFile = `${tempDir}/patch.diff`;

	const encodedOriginal = Buffer.from(originalContent).toString("base64");
	const encodedPatch = Buffer.from(patchContent).toString("base64");

	const command = `
mkdir -p "${tempDir}";
echo "${encodedOriginal}" | base64 -d > "${tempFile}";
echo "${encodedPatch}" | base64 -d > "${patchFile}";
cd "${tempDir}" && patch -p0 < "${patchFile}" 2>/dev/null;
cat "${tempFile}";
rm -rf "${tempDir}";
`;

	try {
		const result = await execAsync(command);
		return result.stdout;
	} catch {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to apply patch to content",
		});
	}
};

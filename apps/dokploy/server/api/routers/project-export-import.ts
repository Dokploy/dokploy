import { db } from "@dokploy/server/db";
import {
	assertTransferPermission,
	BundleCryptoError,
	BundleFormatError,
	exportProject,
	findOrganizationServerId,
	importBundle,
	MAX_BUNDLE_BYTES,
	MIN_PASSPHRASE_LENGTH,
	ProjectNotFoundError,
	previewBundle,
	readBundle,
} from "@dokploy/server/services/project-export-import";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { audit } from "../utils/audit";

const passphraseSchema = z.string().min(MIN_PASSPHRASE_LENGTH);
const bundleSchema = z.string().max(MAX_BUNDLE_BYTES);

const readBundleOrThrow = async (bundle: string, passphrase: string) => {
	try {
		return await readBundle(bundle, passphrase);
	} catch (error) {
		if (
			error instanceof BundleCryptoError ||
			error instanceof BundleFormatError
		) {
			throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
		}
		throw error;
	}
};

export const projectExportImportRouter = createTRPCRouter({
	export: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				serviceIds: z.array(z.string()).optional(),
				passphrase: passphraseSchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await assertTransferPermission(ctx, input.projectId, "export");
			try {
				const result = await exportProject(db, input);
				await audit(ctx, {
					action: "export",
					resourceType: "project",
					resourceId: input.projectId,
				});
				return result;
			} catch (error) {
				if (error instanceof ProjectNotFoundError) {
					throw new TRPCError({ code: "NOT_FOUND", message: error.message });
				}
				throw error;
			}
		}),

	importPreview: protectedProcedure
		.input(z.object({ bundle: bundleSchema, passphrase: passphraseSchema }))
		.mutation(async ({ ctx, input }) => {
			await assertTransferPermission(ctx, undefined, "import");
			const { exportedAt, payload } = await readBundleOrThrow(
				input.bundle,
				input.passphrase,
			);
			return previewBundle(exportedAt, payload);
		}),

	import: protectedProcedure
		.input(
			z.object({
				bundle: bundleSchema,
				passphrase: passphraseSchema,
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await assertTransferPermission(ctx, undefined, "import");
			const organizationId = ctx.session.activeOrganizationId;
			const serverId = await findOrganizationServerId(
				input.serverId,
				organizationId,
			);
			const { payload } = await readBundleOrThrow(
				input.bundle,
				input.passphrase,
			);
			const result = await importBundle(db, payload, {
				organizationId,
				serverId,
			}).catch((error) => {
				if (error instanceof BundleFormatError) {
					throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
				}
				throw error;
			});
			await audit(ctx, {
				action: "import",
				resourceType: "project",
				resourceId: result.projectId,
			});
			return result;
		}),
});

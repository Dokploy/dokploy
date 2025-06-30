import {
	findVolumeBackupById,
	IS_CLOUD,
	updateVolumeBackup,
	removeVolumeBackup,
	createVolumeBackup,
} from "@dokploy/server";
import {
	createVolumeBackupSchema,
	updateVolumeBackupSchema,
	volumeBackups,
} from "@dokploy/server/db/schema";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { db } from "@dokploy/server/db";
import { eq } from "drizzle-orm";

export const volumeBackupsRouter = createTRPCRouter({
	list: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				volumeBackupType: z.enum([
					"application",
					"postgres",
					"mysql",
					"mariadb",
					"mongo",
					"redis",
					"compose",
				]),
			}),
		)
		.query(async ({ input }) => {
			return await db.query.volumeBackups.findMany({
				where: eq(volumeBackups[`${input.volumeBackupType}Id`], input.id),
			});
		}),
	create: protectedProcedure
		.input(createVolumeBackupSchema)
		.mutation(async ({ input }) => {
			return await createVolumeBackup(input);
		}),
	one: protectedProcedure
		.input(
			z.object({
				volumeBackupId: z.string().min(1),
			}),
		)
		.query(async ({ input }) => {
			return await findVolumeBackupById(input.volumeBackupId);
		}),
	delete: protectedProcedure
		.input(
			z.object({
				volumeBackupId: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			if (IS_CLOUD) {
				return true;
			}
			return await removeVolumeBackup(input.volumeBackupId);
		}),
	update: protectedProcedure
		.input(updateVolumeBackupSchema)
		.mutation(async ({ input }) => {
			return await updateVolumeBackup(input.volumeBackupId, input);
		}),

	runManually: protectedProcedure
		.input(z.object({ volumeBackupId: z.string().min(1) }))
		.mutation(async ({ input }) => {
			// return await runVolumeBackupManually(input.volumeBackupId);
		}),
});

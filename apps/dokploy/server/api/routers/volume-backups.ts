import {
	findVolumeBackupById,
	IS_CLOUD,
	updateVolumeBackup,
	removeVolumeBackup,
	createVolumeBackup,
	runVolumeBackup,
	findDestinationById,
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
import { restorePostgresBackup } from "@dokploy/server/utils/restore";
import { observable } from "@trpc/server/observable";

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
				with: {
					application: true,
					postgres: true,
					mysql: true,
					mariadb: true,
					mongo: true,
					redis: true,
					compose: true,
				},
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
			try {
				return await runVolumeBackup(input.volumeBackupId);
			} catch (error) {
				console.error(error);
				return false;
			}
		}),
	restoreVolumeBackupWithLogs: protectedProcedure
		.meta({
			openapi: {
				enabled: false,
				path: "/restore-volume-backup-with-logs",
				method: "POST",
				override: true,
			},
		})
		.input(
			z.object({
				volumeBackupId: z.string().min(1),
				destinationId: z.string().min(1),
				volumeName: z.string().min(1),
			}),
		)
		.subscription(async ({ input }) => {
			const destination = await findDestinationById(input.destinationId);

			return observable<string>((emit) => {
				// restorePostgresBackup(postgres, destination, input, (log) => {
				// 	emit.next(log);
				// });
			});
		}),
});

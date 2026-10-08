import {
	createVolumeBackup,
	findVolumeBackupById,
	IS_CLOUD,
	removeVolumeBackup,
	removeVolumeBackupJob,
	runVolumeBackup,
	scheduleVolumeBackup,
	updateVolumeBackup,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	createVolumeBackupSchema,
	updateVolumeBackupSchema,
	volumeBackups,
} from "@dokploy/server/db/schema";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { assertVolumeBackupLimit } from "@/server/api/utils/plan-limits";
import { removeJob, schedule, updateJob } from "@/server/utils/backup";
import { createTRPCRouter, protectedProcedure } from "../trpc";

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
					"libsql",
				]),
			}),
		)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.id, {
				volumeBackup: ["read"],
			});
			return await db.query.volumeBackups.findMany({
				where: eq(volumeBackups[`${input.volumeBackupType}Id`], input.id),
				with: {
					application: {
						columns: { applicationId: true, appName: true, serverId: true },
					},
					postgres: {
						columns: { postgresId: true, appName: true, serverId: true },
					},
					mysql: { columns: { mysqlId: true, appName: true, serverId: true } },
					mariadb: {
						columns: { mariadbId: true, appName: true, serverId: true },
					},
					mongo: { columns: { mongoId: true, appName: true, serverId: true } },
					redis: { columns: { redisId: true, appName: true, serverId: true } },
					compose: {
						columns: { composeId: true, appName: true, serverId: true },
					},
					libsql: {
						columns: { libsqlId: true, appName: true, serverId: true },
					},
				},
				orderBy: [desc(volumeBackups.createdAt)],
			});
		}),
	create: protectedProcedure
		.input(createVolumeBackupSchema)
		.mutation(async ({ input, ctx }) => {
			const serviceType = (
				[
					"application",
					"postgres",
					"mysql",
					"mariadb",
					"mongo",
					"redis",
					"libsql",
					"compose",
				] as const
			).find((type) => input[`${type}Id`]);
			const serviceId = serviceType ? input[`${serviceType}Id`] : undefined;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					volumeBackup: ["create"],
				});
			}
			if (IS_CLOUD && serviceType && serviceId) {
				const existingVolumeBackups = await db.query.volumeBackups.findMany({
					where: eq(volumeBackups[`${serviceType}Id`], serviceId),
				});
				await assertVolumeBackupLimit(
					ctx.session.activeOrganizationId,
					existingVolumeBackups.length,
				);
			}
			const newVolumeBackup = await createVolumeBackup(input);

			if (newVolumeBackup?.enabled) {
				if (IS_CLOUD) {
					await schedule({
						cronSchedule: newVolumeBackup.cronExpression,
						volumeBackupId: newVolumeBackup.volumeBackupId,
						type: "volume-backup",
					});
				} else {
					await scheduleVolumeBackup(newVolumeBackup.volumeBackupId);
				}
			}
			await audit(ctx, {
				action: "create",
				resourceType: "volumeBackup",
				resourceId: newVolumeBackup?.volumeBackupId,
			});
			return newVolumeBackup;
		}),
	one: protectedProcedure
		.input(
			z.object({
				volumeBackupId: z.string().min(1),
			}),
		)
		.query(async ({ input, ctx }) => {
			const vb = await findVolumeBackupById(input.volumeBackupId);
			const serviceId =
				vb.applicationId ||
				vb.postgresId ||
				vb.mysqlId ||
				vb.mariadbId ||
				vb.mongoId ||
				vb.redisId ||
				vb.libsqlId ||
				vb.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					volumeBackup: ["read"],
				});
			}
			return vb;
		}),
	delete: protectedProcedure
		.input(
			z.object({
				volumeBackupId: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const vb = await findVolumeBackupById(input.volumeBackupId);
			const serviceId =
				vb.applicationId ||
				vb.postgresId ||
				vb.mysqlId ||
				vb.mariadbId ||
				vb.mongoId ||
				vb.redisId ||
				vb.libsqlId ||
				vb.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					volumeBackup: ["delete"],
				});
			}
			const result = await removeVolumeBackup(input.volumeBackupId);
			await audit(ctx, {
				action: "delete",
				resourceType: "volumeBackup",
				resourceId: input.volumeBackupId,
			});
			return result;
		}),
	update: protectedProcedure
		.input(updateVolumeBackupSchema)
		.mutation(async ({ input, ctx }) => {
			const existingVb = await findVolumeBackupById(input.volumeBackupId);
			const serviceId =
				existingVb.applicationId ||
				existingVb.postgresId ||
				existingVb.mysqlId ||
				existingVb.mariadbId ||
				existingVb.mongoId ||
				existingVb.redisId ||
				existingVb.libsqlId ||
				existingVb.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					volumeBackup: ["update"],
				});
			}
			const updatedVolumeBackup = await updateVolumeBackup(
				input.volumeBackupId,
				input,
			);

			if (!updatedVolumeBackup) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Volume backup not found",
				});
			}

			if (IS_CLOUD) {
				if (updatedVolumeBackup.enabled) {
					await updateJob({
						cronSchedule: updatedVolumeBackup.cronExpression,
						volumeBackupId: updatedVolumeBackup.volumeBackupId,
						type: "volume-backup",
					});
				} else {
					await removeJob({
						cronSchedule: updatedVolumeBackup.cronExpression,
						volumeBackupId: updatedVolumeBackup.volumeBackupId,
						type: "volume-backup",
					});
				}
			} else {
				if (updatedVolumeBackup?.enabled) {
					removeVolumeBackupJob(updatedVolumeBackup.volumeBackupId);
					scheduleVolumeBackup(updatedVolumeBackup.volumeBackupId);
				} else {
					removeVolumeBackupJob(updatedVolumeBackup.volumeBackupId);
				}
			}
			await audit(ctx, {
				action: "update",
				resourceType: "volumeBackup",
				resourceId: updatedVolumeBackup.volumeBackupId,
			});
			return updatedVolumeBackup;
		}),

	runManually: protectedProcedure
		.input(z.object({ volumeBackupId: z.string().min(1) }))
		.mutation(async ({ input, ctx }) => {
			const vb = await findVolumeBackupById(input.volumeBackupId);
			const serviceId =
				vb.applicationId ||
				vb.postgresId ||
				vb.mysqlId ||
				vb.mariadbId ||
				vb.mongoId ||
				vb.redisId ||
				vb.libsqlId ||
				vb.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					volumeBackup: ["create"],
				});
			}
			try {
				const result = await runVolumeBackup(input.volumeBackupId);
				await audit(ctx, {
					action: "run",
					resourceType: "volumeBackup",
					resourceId: input.volumeBackupId,
				});
				return result;
			} catch (error) {
				console.error(error);
				return false;
			}
		}),
});

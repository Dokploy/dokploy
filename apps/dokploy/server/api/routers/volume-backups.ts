import {
	createVolumeBackup,
	findVolumeBackupById,
	IS_CLOUD,
	removeVolumeBackup,
	removeVolumeBackupJob,
	restoreVolume,
	runVolumeBackup,
	scheduleVolumeBackup,
	updateVolumeBackup,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	applications,
	compose,
	createVolumeBackupSchema,
	mounts,
	updateVolumeBackupSchema,
	VOLUME_NAME_MESSAGE,
	VOLUME_NAME_REGEX,
	volumeBackups,
} from "@dokploy/server/db/schema";
import { findDestinationById } from "@dokploy/server/services/destination";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { findServerById } from "@dokploy/server/services/server";
import {
	execAsyncRemote,
	execAsyncStream,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { assertVolumeBackupLimit } from "@/server/api/utils/plan-limits";
import { removeJob, schedule, updateJob } from "@/server/utils/backup";
import { createTRPCRouter, protectedProcedure, withPermission } from "../trpc";

type VolumeCtx = Parameters<typeof checkServicePermissionAndAccess>[0];

type VolumeHost = { serverId: string | null };

const serviceHost = {
	columns: { serverId: true },
	with: {
		environment: {
			columns: { environmentId: true },
			with: { project: { columns: { organizationId: true } } },
		},
	},
} as const;

const backupHost = { columns: { serverId: true } } as const;

const volumeBackupServiceFields = [
	"applicationId",
	"postgresId",
	"mysqlId",
	"mariadbId",
	"mongoId",
	"redisId",
	"libsqlId",
	"composeId",
] as const;

type VolumeBackupServices = Partial<
	Record<(typeof volumeBackupServiceFields)[number], string | null>
>;

const namedServiceIds = (services: VolumeBackupServices) =>
	volumeBackupServiceFields
		.map((field) => services[field])
		.filter((serviceId): serviceId is string => !!serviceId);

// runVolumeBackup runs a backup on application?.serverId || compose?.serverId
// of the stored row, else on the Dokploy server, whatever else the row names.
const findBackupHost = async ({
	applicationId,
	composeId,
}: VolumeBackupServices): Promise<VolumeHost> => {
	const [application, composeService] = await Promise.all([
		applicationId
			? db.query.applications.findFirst({
					where: eq(applications.applicationId, applicationId),
					...backupHost,
				})
			: undefined,
		composeId
			? db.query.compose.findFirst({
					where: eq(compose.composeId, composeId),
					...backupHost,
				})
			: undefined,
	]);
	if ((applicationId && !application) || (composeId && !composeService)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "The service of this volume backup was not found.",
		});
	}
	return {
		serverId: application?.serverId || composeService?.serverId || null,
	};
};

// volumeName is free input, so a backup or restore of one service can reach a
// named volume another service mounts, which must allow the action too. A named
// volume belongs to its Docker host, and organizations share the Dokploy
// server's host on self-hosted Dokploy, so another organization's mount on the
// host where the command runs refuses the action, and mounts elsewhere never do.
const checkVolumeServices = async (
	ctx: VolumeCtx,
	volumeName: string,
	checkedServiceIds: string[],
	host: VolumeHost,
	permissions: Parameters<typeof checkServicePermissionAndAccess>[2],
) => {
	const volumeMounts = await db.query.mounts.findMany({
		where: and(eq(mounts.type, "volume"), eq(mounts.volumeName, volumeName)),
		with: {
			application: serviceHost,
			compose: serviceHost,
			postgres: serviceHost,
			mysql: serviceHost,
			mariadb: serviceHost,
			mongo: serviceHost,
			redis: serviceHost,
			libsql: serviceHost,
		},
	});
	for (const mount of volumeMounts) {
		const mountService =
			mount.application ??
			mount.compose ??
			mount.postgres ??
			mount.mysql ??
			mount.mariadb ??
			mount.mongo ??
			mount.redis ??
			mount.libsql;
		if (!mountService || mountService.serverId !== host.serverId) {
			continue;
		}
		if (
			mountService.environment.project.organizationId !==
			ctx.session.activeOrganizationId
		) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this volume",
			});
		}
		const mountServiceId =
			mount.applicationId ||
			mount.postgresId ||
			mount.mysqlId ||
			mount.mariadbId ||
			mount.mongoId ||
			mount.redisId ||
			mount.libsqlId ||
			mount.composeId;
		if (mountServiceId && !checkedServiceIds.includes(mountServiceId)) {
			await checkServicePermissionAndAccess(ctx, mountServiceId, permissions);
		}
	}
};

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
			const serviceIds = namedServiceIds(input);
			for (const namedServiceId of serviceIds) {
				await checkServicePermissionAndAccess(ctx, namedServiceId, {
					volumeBackup: ["create"],
				});
			}
			await checkVolumeServices(
				ctx,
				input.volumeName,
				serviceIds,
				await findBackupHost(input),
				{ volumeBackup: ["create"] },
			);
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
			// serviceType picks which named service a backup stops and restarts, so
			// every service the row names must allow the change.
			const existingIds = namedServiceIds(existingVb);
			for (const existingId of existingIds) {
				await checkServicePermissionAndAccess(ctx, existingId, {
					volumeBackup: ["update"],
				});
			}
			// The input can move the row onto another service, which must allow it too.
			const targetIds = namedServiceIds(input).filter(
				(targetId) => !existingIds.includes(targetId),
			);
			for (const targetId of targetIds) {
				await checkServicePermissionAndAccess(ctx, targetId, {
					volumeBackup: ["create"],
				});
			}
			const storedServices = Object.fromEntries(
				volumeBackupServiceFields.map((field) => [
					field,
					input[field] === undefined
						? (existingVb[field] ?? null)
						: input[field],
				]),
			) as VolumeBackupServices;
			await checkVolumeServices(
				ctx,
				input.volumeName,
				[...existingIds, ...targetIds],
				await findBackupHost(storedServices),
				{ volumeBackup: ["create"] },
			);
			// A concurrent update can change the row after it was read, so the write
			// sets every service column to the state checked above.
			const updatedVolumeBackup = await updateVolumeBackup(
				input.volumeBackupId,
				{ ...input, ...storedServices },
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
			for (const serviceId of namedServiceIds(vb)) {
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
	restoreVolumeBackupWithLogs: withPermission("volumeBackup", "restore")
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
				backupFileName: z.string().min(1),
				destinationId: z.string().min(1),
				volumeName: z
					.string()
					.min(1)
					.regex(VOLUME_NAME_REGEX, VOLUME_NAME_MESSAGE),
				id: z.string().min(1),
				serviceType: z.enum(["application", "compose"]),
				serverId: z.string().optional(),
			}),
		)
		.subscription(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.id, {
				volumeBackup: ["restore"],
			});
			// restoreVolume runs on the server the input names.
			await checkVolumeServices(
				ctx,
				input.volumeName,
				[input.id],
				{ serverId: input.serverId || null },
				{ volumeBackup: ["restore"] },
			);
			const destination = await findDestinationById(input.destinationId);
			if (destination.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have access to this destination.",
				});
			}
			if (input.serverId) {
				const targetServer = await findServerById(input.serverId);
				if (targetServer.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to this server.",
					});
				}
			}
			return observable<string>((emit) => {
				const runRestore = async () => {
					try {
						emit.next("🚀 Starting volume restore process...");
						emit.next(`📂 Backup File: ${input.backupFileName}`);
						emit.next(`🔧 Volume Name: ${input.volumeName}`);
						emit.next(`🏷️ Service Type: ${input.serviceType}`);
						emit.next(""); // Empty line for better readability

						// Generate the restore command
						const restoreCommand = await restoreVolume(
							input.id,
							input.destinationId,
							input.volumeName,
							input.backupFileName,
							input.serverId || "",
							input.serviceType,
						);

						emit.next("📋 Generated restore command:");
						emit.next("▶️ Executing restore...");
						emit.next(""); // Empty line

						// Execute the restore command with real-time output
						if (input.serverId) {
							emit.next(`🌐 Executing on remote server: ${input.serverId}`);
							await execAsyncRemote(input.serverId, restoreCommand, (data) => {
								emit.next(data);
							});
						} else {
							emit.next("🖥️ Executing on local server");
							await execAsyncStream(restoreCommand, (data) => {
								emit.next(data);
							});
						}

						emit.next("");
						emit.next("✅ Volume restore completed successfully!");
						emit.next(
							"🎉 All containers/services have been restarted with the restored volume.",
						);
					} catch {
						emit.next("");
						emit.next("❌ Volume restore failed!");
					} finally {
						emit.complete();
					}
				};

				// Start the restore process
				runRestore();
			});
		}),
});

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiCreateBackup,
	apiFindOneBackup,
	apiRemoveBackup,
	apiUpdateBackup,
} from "@/server/db/schema";
import { removeJob, schedule, updateJob } from "@/server/utils/backup";
import {
	IS_CLOUD,
	createBackup,
	findBackupById,
	findMariadbByBackupId,
	findMariadbById,
	findMongoByBackupId,
	findMongoById,
	findMySqlByBackupId,
	findMySqlById,
	findPostgresByBackupId,
	findPostgresById,
	findServerById,
	removeBackupById,
	removeScheduleBackup,
	runMariadbBackup,
	runMongoBackup,
	runMySqlBackup,
	runPostgresBackup,
	scheduleBackup,
	updateBackupById,
} from "@dokploy/server";

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { getS3Credentials } from "@dokploy/server/utils/backups/utils";
import { findDestinationById } from "@dokploy/server/services/destination";
import {
	restoreMariadbBackup,
	restoreMongoBackup,
	restoreMySqlBackup,
	restorePostgresBackup,
} from "@dokploy/server/utils/restore";
import { observable } from "@trpc/server/observable";

export const backupRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateBackup)
		.mutation(async ({ input }) => {
			try {
				const newBackup = await createBackup(input);

				const backup = await findBackupById(newBackup.backupId);

				if (IS_CLOUD && backup.enabled) {
					const databaseType = backup.databaseType;
					let serverId = "";
					if (databaseType === "postgres" && backup.postgres?.serverId) {
						serverId = backup.postgres.serverId;
					} else if (databaseType === "mysql" && backup.mysql?.serverId) {
						serverId = backup.mysql.serverId;
					} else if (databaseType === "mongo" && backup.mongo?.serverId) {
						serverId = backup.mongo.serverId;
					} else if (databaseType === "mariadb" && backup.mariadb?.serverId) {
						serverId = backup.mariadb.serverId;
					}
					const server = await findServerById(serverId);

					if (server.serverStatus === "inactive") {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Server is inactive",
						});
					}
					await schedule({
						cronSchedule: backup.schedule,
						backupId: backup.backupId,
						type: "backup",
					});
				} else {
					if (backup.enabled) {
						scheduleBackup(backup);
					}
				}
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the Backup",
					cause: error,
				});
			}
		}),
	one: protectedProcedure.input(apiFindOneBackup).query(async ({ input }) => {
		const backup = await findBackupById(input.backupId);

		return backup;
	}),
	update: protectedProcedure
		.input(apiUpdateBackup)
		.mutation(async ({ input }) => {
			try {
				await updateBackupById(input.backupId, input);
				const backup = await findBackupById(input.backupId);

				if (IS_CLOUD) {
					if (backup.enabled) {
						await updateJob({
							cronSchedule: backup.schedule,
							backupId: backup.backupId,
							type: "backup",
						});
					} else {
						await removeJob({
							cronSchedule: backup.schedule,
							backupId: backup.backupId,
							type: "backup",
						});
					}
				} else {
					if (backup.enabled) {
						removeScheduleBackup(input.backupId);
						scheduleBackup(backup);
					} else {
						removeScheduleBackup(input.backupId);
					}
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Error updating this Backup";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message,
				});
			}
		}),
	remove: protectedProcedure
		.input(apiRemoveBackup)
		.mutation(async ({ input }) => {
			try {
				const value = await removeBackupById(input.backupId);
				if (IS_CLOUD && value) {
					removeJob({
						backupId: input.backupId,
						cronSchedule: value.schedule,
						type: "backup",
					});
				} else if (!IS_CLOUD) {
					removeScheduleBackup(input.backupId);
				}
				return value;
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Error deleting this Backup";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message,
				});
			}
		}),
	manualBackupPostgres: protectedProcedure
		.input(apiFindOneBackup)
		.mutation(async ({ input }) => {
			try {
				const backup = await findBackupById(input.backupId);
				const postgres = await findPostgresByBackupId(backup.backupId);
				await runPostgresBackup(postgres, backup);
				return true;
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Error running manual Postgres backup ";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message,
				});
			}
		}),

	manualBackupMySql: protectedProcedure
		.input(apiFindOneBackup)
		.mutation(async ({ input }) => {
			try {
				const backup = await findBackupById(input.backupId);
				const mysql = await findMySqlByBackupId(backup.backupId);
				await runMySqlBackup(mysql, backup);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error running manual MySQL backup ",
					cause: error,
				});
			}
		}),
	manualBackupMariadb: protectedProcedure
		.input(apiFindOneBackup)
		.mutation(async ({ input }) => {
			try {
				const backup = await findBackupById(input.backupId);
				const mariadb = await findMariadbByBackupId(backup.backupId);
				await runMariadbBackup(mariadb, backup);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error running manual Mariadb backup ",
					cause: error,
				});
			}
		}),
	manualBackupMongo: protectedProcedure
		.input(apiFindOneBackup)
		.mutation(async ({ input }) => {
			try {
				const backup = await findBackupById(input.backupId);
				const mongo = await findMongoByBackupId(backup.backupId);
				await runMongoBackup(mongo, backup);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error running manual Mongo backup ",
					cause: error,
				});
			}
		}),
	listBackupFiles: protectedProcedure
		.input(
			z.object({
				destinationId: z.string(),
				search: z.string(),
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			try {
				const destination = await findDestinationById(input.destinationId);
				const rcloneFlags = getS3Credentials(destination);
				const bucketPath = `:s3:${destination.bucket}`;

				const lastSlashIndex = input.search.lastIndexOf("/");
				const baseDir =
					lastSlashIndex !== -1
						? input.search.slice(0, lastSlashIndex + 1)
						: "";
				const searchTerm =
					lastSlashIndex !== -1
						? input.search.slice(lastSlashIndex + 1)
						: input.search;

				const searchPath = baseDir ? `${bucketPath}/${baseDir}` : bucketPath;
				const listCommand = `rclone lsf ${rcloneFlags.join(" ")} "${searchPath}" | head -n 100`;

				let stdout = "";

				if (input.serverId) {
					const result = await execAsyncRemote(listCommand, input.serverId);
					stdout = result.stdout;
				} else {
					const result = await execAsync(listCommand);
					stdout = result.stdout;
				}

				const files = stdout.split("\n").filter(Boolean);

				const results = baseDir
					? files.map((file) => `${baseDir}${file}`)
					: files;

				if (searchTerm) {
					return results.filter((file) =>
						file.toLowerCase().includes(searchTerm.toLowerCase()),
					);
				}

				return results;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error listing backup files",
					cause: error,
				});
			}
		}),

	restoreBackupWithLogs: protectedProcedure
		.meta({
			openapi: {
				enabled: false,
				path: "/restore-backup-with-logs",
				method: "POST",
				override: true,
			},
		})
		.input(
			z.object({
				databaseId: z.string(),
				databaseType: z.enum(["postgres", "mysql", "mariadb", "mongo"]),
				databaseName: z.string().min(1),
				backupFile: z.string().min(1),
				destinationId: z.string().min(1),
			}),
		)
		.subscription(async ({ input }) => {
			const destination = await findDestinationById(input.destinationId);
			if (input.databaseType === "postgres") {
				const postgres = await findPostgresById(input.databaseId);

				return observable<string>((emit) => {
					restorePostgresBackup(
						postgres,
						destination,
						input.databaseName,
						input.backupFile,
						(log) => {
							emit.next(log);
						},
					);
				});
			}
			if (input.databaseType === "mysql") {
				const mysql = await findMySqlById(input.databaseId);
				return observable<string>((emit) => {
					restoreMySqlBackup(
						mysql,
						destination,
						input.databaseName,
						input.backupFile,
						(log) => {
							emit.next(log);
						},
					);
				});
			}
			if (input.databaseType === "mariadb") {
				const mariadb = await findMariadbById(input.databaseId);
				return observable<string>((emit) => {
					restoreMariadbBackup(
						mariadb,
						destination,
						input.databaseName,
						input.backupFile,
						(log) => {
							emit.next(log);
						},
					);
				});
			}
			if (input.databaseType === "mongo") {
				const mongo = await findMongoById(input.databaseId);
				return observable<string>((emit) => {
					restoreMongoBackup(
						mongo,
						destination,
						input.databaseName,
						input.backupFile,
						(log) => {
							emit.next(log);
						},
					);
				});
			}

			return true;
		}),
});

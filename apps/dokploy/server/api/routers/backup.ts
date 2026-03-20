import {
	createBackup,
	findBackupById,
	findComposeByBackupId,
	findComposeById,
	findMariadbByBackupId,
	findMariadbById,
	findMongoByBackupId,
	findMongoById,
	findMySqlByBackupId,
	findMySqlById,
	findPostgresByBackupId,
	findPostgresById,
	findServerById,
	IS_CLOUD,
	keepLatestNBackups,
	removeBackupById,
	removeScheduleBackup,
	runMariadbBackup,
	runMongoBackup,
	runMySqlBackup,
	runPostgresBackup,
	runWebServerBackup,
	scheduleBackup,
	updateBackupById,
} from "@dokploy/server";
import { findDestinationById } from "@dokploy/server/services/destination";
import { runComposeBackup } from "@dokploy/server/utils/backups/compose";
import {
	getDestinationCredentials,
	normalizeS3Path,
} from "@dokploy/server/utils/backups/utils";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import {
	restoreComposeBackup,
	restoreMariadbBackup,
	restoreMongoBackup,
	restoreMySqlBackup,
	restorePostgresBackup,
	restoreWebServerBackup,
} from "@dokploy/server/utils/restore";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateBackup,
	apiFindOneBackup,
	apiRemoveBackup,
	apiRestoreBackup,
	apiUpdateBackup,
} from "@/server/db/schema";
import { removeJob, schedule, updateJob } from "@/server/utils/backup";

interface RcloneFile {
	Path: string;
	Name: string;
	Size: number;
	IsDir: boolean;
	Tier?: string;
	Hashes?: {
		MD5?: string;
		SHA1?: string;
	};
}

export const backupRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateBackup)
		.mutation(async ({ input, ctx }) => {
			try {
				const serviceId =
					input.postgresId ||
					input.mysqlId ||
					input.mariadbId ||
					input.mongoId ||
					input.composeId;
				if (serviceId) {
					await checkServicePermissionAndAccess(ctx, serviceId, {
						backup: ["create"],
					});
				}

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
					} else if (
						backup.backupType === "compose" &&
						backup.compose?.serverId
					) {
						serverId = backup.compose.serverId;
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
				await audit(ctx, {
					action: "create",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
			} catch (error) {
				console.error(error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error creating the Backup",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneBackup)
		.query(async ({ input, ctx }) => {
			const backup = await findBackupById(input.backupId);

			const serviceId =
				backup.postgresId ||
				backup.mysqlId ||
				backup.mariadbId ||
				backup.mongoId ||
				backup.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					backup: ["read"],
				});
			}

			return backup;
		}),
	update: protectedProcedure
		.input(apiUpdateBackup)
		.mutation(async ({ input, ctx }) => {
			try {
				const existing = await findBackupById(input.backupId);
				const serviceId =
					existing.postgresId ||
					existing.mysqlId ||
					existing.mariadbId ||
					existing.mongoId ||
					existing.composeId;
				if (serviceId) {
					await checkServicePermissionAndAccess(ctx, serviceId, {
						backup: ["update"],
					});
				}

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
				await audit(ctx, {
					action: "update",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
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
		.mutation(async ({ input, ctx }) => {
			try {
				const backup = await findBackupById(input.backupId);
				const serviceId =
					backup.postgresId ||
					backup.mysqlId ||
					backup.mariadbId ||
					backup.mongoId ||
					backup.composeId;
				if (serviceId) {
					await checkServicePermissionAndAccess(ctx, serviceId, {
						backup: ["delete"],
					});
				}

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
				await audit(ctx, {
					action: "delete",
					resourceType: "backup",
					resourceId: input.backupId,
				});
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
		.mutation(async ({ input, ctx }) => {
			try {
				const backup = await findBackupById(input.backupId);
				if (backup.postgresId) {
					await checkServicePermissionAndAccess(ctx, backup.postgresId, {
						backup: ["create"],
					});
				}
				const postgres = await findPostgresByBackupId(backup.backupId);
				await runPostgresBackup(postgres, backup);
				await keepLatestNBackups(backup, postgres?.serverId);
				await audit(ctx, {
					action: "run",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
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
		.mutation(async ({ input, ctx }) => {
			try {
				const backup = await findBackupById(input.backupId);
				if (backup.mysqlId) {
					await checkServicePermissionAndAccess(ctx, backup.mysqlId, {
						backup: ["create"],
					});
				}
				const mysql = await findMySqlByBackupId(backup.backupId);
				await runMySqlBackup(mysql, backup);
				await keepLatestNBackups(backup, mysql?.serverId);
				await audit(ctx, {
					action: "run",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
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
		.mutation(async ({ input, ctx }) => {
			try {
				const backup = await findBackupById(input.backupId);
				if (backup.mariadbId) {
					await checkServicePermissionAndAccess(ctx, backup.mariadbId, {
						backup: ["create"],
					});
				}
				const mariadb = await findMariadbByBackupId(backup.backupId);
				await runMariadbBackup(mariadb, backup);
				await keepLatestNBackups(backup, mariadb?.serverId);
				await audit(ctx, {
					action: "run",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error running manual Mariadb backup ",
					cause: error,
				});
			}
		}),
	manualBackupCompose: protectedProcedure
		.input(apiFindOneBackup)
		.mutation(async ({ input, ctx }) => {
			try {
				const backup = await findBackupById(input.backupId);
				if (backup.composeId) {
					await checkServicePermissionAndAccess(ctx, backup.composeId, {
						backup: ["create"],
					});
				}
				const compose = await findComposeByBackupId(backup.backupId);
				await runComposeBackup(compose, backup);
				await keepLatestNBackups(backup, compose?.serverId);
				await audit(ctx, {
					action: "run",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error running manual Compose backup ",
					cause: error,
				});
			}
		}),
	manualBackupMongo: protectedProcedure
		.input(apiFindOneBackup)
		.mutation(async ({ input, ctx }) => {
			try {
				const backup = await findBackupById(input.backupId);
				if (backup.mongoId) {
					await checkServicePermissionAndAccess(ctx, backup.mongoId, {
						backup: ["create"],
					});
				}
				const mongo = await findMongoByBackupId(backup.backupId);
				await runMongoBackup(mongo, backup);
				await keepLatestNBackups(backup, mongo?.serverId);
				await audit(ctx, {
					action: "run",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error running manual Mongo backup ",
					cause: error,
				});
			}
		}),
	manualBackupWebServer: withPermission("backup", "create")
		.input(apiFindOneBackup)
		.mutation(async ({ input, ctx }) => {
			const backup = await findBackupById(input.backupId);
			await runWebServerBackup(backup);
			await keepLatestNBackups(backup);
			await audit(ctx, {
				action: "run",
				resourceType: "backup",
				resourceId: backup.backupId,
			});
			return true;
		}),
	listBackupFiles: withPermission("backup", "read")
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
				const { rcloneFlags, remotePrefix } =
					getDestinationCredentials(destination);
				const bucketPath = remotePrefix.replace(/\/$/, "");

				const lastSlashIndex = input.search.lastIndexOf("/");
				const baseDir =
					lastSlashIndex !== -1
						? normalizeS3Path(input.search.slice(0, lastSlashIndex + 1))
						: "";
				const searchTerm =
					lastSlashIndex !== -1
						? input.search.slice(lastSlashIndex + 1)
						: input.search;

				const searchPath = baseDir ? `${bucketPath}/${baseDir}` : bucketPath;
				const listCommand = `rclone lsjson ${rcloneFlags.join(" ")} "${searchPath}" --no-mimetype --no-modtime 2>/dev/null`;

				const needsShell =
					destination.destinationType === "ftp" ||
					destination.destinationType === "sftp";

				let stdout = "";

				if (input.serverId) {
					const result = await execAsyncRemote(input.serverId, listCommand);
					stdout = result.stdout;
				} else {
					const result = await execAsync(
						listCommand,
						needsShell ? { shell: "/bin/bash" } : undefined,
					);
					stdout = result.stdout;
				}

				let files: RcloneFile[] = [];
				try {
					files = JSON.parse(stdout) as RcloneFile[];
				} catch (error) {
					console.error("Error parsing JSON response:", error);
					console.error("Raw stdout:", stdout);
					throw new Error("Failed to parse backup files list");
				}

				// Limit to first 100 files

				const results = baseDir
					? files.map((file) => ({
							...file,
							Path: `${baseDir}${file.Path}`,
						}))
					: files;

				if (searchTerm) {
					return results
						.filter((file) =>
							file.Path.toLowerCase().includes(searchTerm.toLowerCase()),
						)
						.slice(0, 100);
				}

				return results.slice(0, 100);
			} catch (error) {
				console.error("Error in listBackupFiles:", error);
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
		.input(apiRestoreBackup)
		.subscription(async function* ({ input, ctx, signal }) {
			if (input.databaseId) {
				await checkServicePermissionAndAccess(ctx, input.databaseId, {
					backup: ["restore"],
				});
			}
			const destination = await findDestinationById(input.destinationId);
			const queue: string[] = [];
			const done = false;
			if (input.backupType === "database") {
				if (input.databaseType === "postgres") {
					const postgres = await findPostgresById(input.databaseId);

					restorePostgresBackup(postgres, destination, input, (log) => {
						queue.push(log);
					});
				}

				if (input.databaseType === "mysql") {
					const mysql = await findMySqlById(input.databaseId);
					restoreMySqlBackup(mysql, destination, input, (log) => {
						queue.push(log);
					});
				}
				if (input.databaseType === "mariadb") {
					const mariadb = await findMariadbById(input.databaseId);
					restoreMariadbBackup(mariadb, destination, input, (log) => {
						queue.push(log);
					});
				}
				if (input.databaseType === "mongo") {
					const mongo = await findMongoById(input.databaseId);
					restoreMongoBackup(mongo, destination, input, (log) => {
						queue.push(log);
					});
				}
				if (input.databaseType === "web-server") {
					restoreWebServerBackup(destination, input.backupFile, (log) => {
						queue.push(log);
					});
				}
			}
			if (input.backupType === "compose") {
				const compose = await findComposeById(input.databaseId);
				restoreComposeBackup(compose, destination, input, (log) => {
					queue.push(log);
				});
			}
			while (!done || queue.length > 0) {
				if (queue.length > 0) {
					yield queue.shift()!;
				} else {
					await new Promise((r) => setTimeout(r, 50));
				}

				if (signal?.aborted) {
					return;
				}
			}
		}),
});

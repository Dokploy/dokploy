import {
	createBackup,
	execAsync,
	execAsyncRemote,
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
	updateDeploymentStatus,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { deployments } from "@dokploy/server/db/schema/deployment";
import { findDestinationById } from "@dokploy/server/services/destination";
import { runComposeBackup } from "@dokploy/server/utils/backups/compose";
import {
	getS3Credentials,
	normalizeS3Path,
} from "@dokploy/server/utils/backups/utils";
import {
	restoreComposeBackup,
	restoreMariadbBackup,
	restoreMongoBackup,
	restoreMySqlBackup,
	restorePostgresBackup,
	restoreWebServerBackup,
} from "@dokploy/server/utils/restore";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
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

				await keepLatestNBackups(backup, postgres?.serverId);
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
				await keepLatestNBackups(backup, mysql?.serverId);
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
				await keepLatestNBackups(backup, mariadb?.serverId);
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
		.mutation(async ({ input }) => {
			try {
				const backup = await findBackupById(input.backupId);
				const compose = await findComposeByBackupId(backup.backupId);
				await runComposeBackup(compose, backup);
				await keepLatestNBackups(backup, compose?.serverId);
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
		.mutation(async ({ input }) => {
			try {
				const backup = await findBackupById(input.backupId);
				const mongo = await findMongoByBackupId(backup.backupId);
				await runMongoBackup(mongo, backup);
				await keepLatestNBackups(backup, mongo?.serverId);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error running manual Mongo backup ",
					cause: error,
				});
			}
		}),
	manualBackupWebServer: protectedProcedure
		.input(apiFindOneBackup)
		.mutation(async ({ input }) => {
			const backup = await findBackupById(input.backupId);
			await runWebServerBackup(backup);
			return true;
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
						? normalizeS3Path(input.search.slice(0, lastSlashIndex + 1))
						: "";
				const searchTerm =
					lastSlashIndex !== -1
						? input.search.slice(lastSlashIndex + 1)
						: input.search;

				const searchPath = baseDir ? `${bucketPath}/${baseDir}` : bucketPath;
				const listCommand = `rclone lsjson ${rcloneFlags.join(" ")} "${searchPath}" --no-mimetype --no-modtime 2>/dev/null`;

				let stdout = "";

				if (input.serverId) {
					const result = await execAsyncRemote(input.serverId, listCommand);
					stdout = result.stdout;
				} else {
					const result = await execAsync(listCommand);
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
		.subscription(async ({ input }) => {
			const destination = await findDestinationById(input.destinationId);
			if (input.backupType === "database") {
				if (input.databaseType === "postgres") {
					const postgres = await findPostgresById(input.databaseId);

					return observable<string>((emit) => {
						restorePostgresBackup(postgres, destination, input, (log) => {
							emit.next(log);
						});
					});
				}
				if (input.databaseType === "mysql") {
					const mysql = await findMySqlById(input.databaseId);
					return observable<string>((emit) => {
						restoreMySqlBackup(mysql, destination, input, (log) => {
							emit.next(log);
						});
					});
				}
				if (input.databaseType === "mariadb") {
					const mariadb = await findMariadbById(input.databaseId);
					return observable<string>((emit) => {
						restoreMariadbBackup(mariadb, destination, input, (log) => {
							emit.next(log);
						});
					});
				}
				if (input.databaseType === "mongo") {
					const mongo = await findMongoById(input.databaseId);
					return observable<string>((emit) => {
						restoreMongoBackup(mongo, destination, input, (log) => {
							emit.next(log);
						});
					});
				}
				if (input.databaseType === "web-server") {
					return observable<string>((emit) => {
						restoreWebServerBackup(destination, input.backupFile, (log) => {
							emit.next(log);
						});
					});
				}
			}
			if (input.backupType === "compose") {
				const compose = await findComposeById(input.databaseId);
				return observable<string>((emit) => {
					restoreComposeBackup(compose, destination, input, (log) => {
						emit.next(log);
					});
				});
			}
			return true;
		}),

	stop: protectedProcedure
		.input(z.object({ backupId: z.string().min(1) }))
		.mutation(async ({ input }) => {
			// Find the running deployment for this backup
			const runningDeployment = await db.query.deployments.findFirst({
				where: and(
					eq(deployments.backupId, input.backupId),
					eq(deployments.status, "running"),
				),
				with: {
					backup: {
						with: {
							postgres: true,
							mysql: true,
							mariadb: true,
							mongo: true,
							compose: true,
						},
					},
				},
				orderBy: [desc(deployments.createdAt)],
			});

			if (!runningDeployment) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "No running backup found",
				});
			}

			if (!runningDeployment.pid) {
				// If no PID, just mark as cancelled
				await updateDeploymentStatus(
					runningDeployment.deploymentId,
					"cancelled",
				);
				return {
					success: true,
					message: "Backup stopped successfully",
				};
			}

			// Determine server ID for remote execution
			const backup = runningDeployment.backup;
			let serverId: string | undefined;
			if (backup?.backupType === "database") {
				serverId =
					backup.postgres?.serverId ||
					backup.mysql?.serverId ||
					backup.mariadb?.serverId ||
					backup.mongo?.serverId;
			} else if (backup?.backupType === "compose") {
				serverId = backup.compose?.serverId;
			}

			// Kill the process
			const command = `kill -9 ${runningDeployment.pid}`;
			try {
				if (serverId) {
					await execAsyncRemote(serverId, command);
				} else {
					await execAsync(command);
				}
			} catch (error) {
				// If kill fails, still mark as cancelled
				console.error("Error killing process:", error);
			}

			// Update deployment status to cancelled
			await updateDeploymentStatus(
				runningDeployment.deploymentId,
				"cancelled",
			);

			return {
				success: true,
				message: "Backup stopped successfully",
			};
		}),
});

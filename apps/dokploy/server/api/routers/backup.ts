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
	getS3Credentials,
	normalizeS3Path,
} from "@dokploy/server/utils/backups/utils";
import { validateS3StorageClassForDestination } from "@dokploy/server/utils/backups/s3-storage-class";
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
	StorageClass?: string;
	RestoreAvailability?: "ready" | "restoring" | "archived" | "unknown";
	RestoreExpiryDate?: string | null;
	Hashes?: {
		MD5?: string;
		SHA1?: string;
	};
}

interface RcloneRestoreStatusEntry {
	Remote?: string;
	StorageClass?: string;
	RestoreStatus?: {
		IsRestoreInProgress?: boolean;
		RestoreExpiryDate?: string | null;
	} | null;
}

const ARCHIVE_STORAGE_CLASSES = new Set(["GLACIER", "DEEP_ARCHIVE", "ARCHIVE"]);

const isArchiveStorageClass = (storageClass?: string | null) => {
	if (!storageClass) {
		return false;
	}
	return ARCHIVE_STORAGE_CLASSES.has(storageClass.toUpperCase());
};

const ARCHIVE_RESTORE_PRIORITY_MAP = {
	standard: "Standard",
	priority: "Expedited",
	bulk: "Bulk",
} as const;

const shEscape = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
const GLOB_PATTERN_CHARS = /[*?\[\]{}]/;

export const backupRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateBackup)
		.mutation(async ({ input }) => {
			try {
				const normalizedStorageClass =
					await validateS3StorageClassForDestination({
						destinationId: input.destinationId,
						storageClass: input.storageClass,
					});

				const newBackup = await createBackup({
					...input,
					storageClass:
						input.storageClass === null ? null : normalizedStorageClass,
				});

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
				const normalizedStorageClass =
					await validateS3StorageClassForDestination({
						destinationId: input.destinationId,
						storageClass: input.storageClass,
					});

				await updateBackupById(input.backupId, {
					...input,
					storageClass:
						input.storageClass === null ? null : normalizedStorageClass,
				});
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
			await keepLatestNBackups(backup);
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
				const restoreStatusCommand = `rclone backend restore-status ${rcloneFlags.join(" ")} "${searchPath}" 2>/dev/null`;

				let stdout = "";
				let restoreStatusStdout = "";

				if (input.serverId) {
					const result = await execAsyncRemote(input.serverId, listCommand);
					stdout = result.stdout;
					try {
						const restoreStatusResult = await execAsyncRemote(
							input.serverId,
							restoreStatusCommand,
						);
						restoreStatusStdout = restoreStatusResult.stdout;
					} catch (error) {
						console.warn("restore-status failed:", error);
					}
				} else {
					const result = await execAsync(listCommand);
					stdout = result.stdout;
					try {
						const restoreStatusResult = await execAsync(restoreStatusCommand);
						restoreStatusStdout = restoreStatusResult.stdout;
					} catch (error) {
						console.warn("restore-status failed:", error);
					}
				}

				let files: RcloneFile[] = [];
				try {
					files = JSON.parse(stdout) as RcloneFile[];
				} catch (error) {
					console.error("Error parsing JSON response:", error);
					console.error("Raw stdout:", stdout);
					throw new Error("Failed to parse backup files list");
				}

				let restoreStatusEntries: RcloneRestoreStatusEntry[] = [];
				if (restoreStatusStdout) {
					try {
						const parsed = JSON.parse(
							restoreStatusStdout,
						) as RcloneRestoreStatusEntry[];
						restoreStatusEntries = Array.isArray(parsed) ? parsed : [];
					} catch (error) {
						console.warn("Failed to parse restore-status response:", error);
					}
				}

				const restoreStatusMap = new Map<string, RcloneRestoreStatusEntry>();
				for (const entry of restoreStatusEntries) {
					const remote = entry.Remote?.replace(/\/$/, "");
					if (!remote) {
						continue;
					}
					restoreStatusMap.set(remote, entry);
				}

				// Limit to first 100 files

				const normalizedBaseDir = baseDir.replace(/\/$/, "");
				const results = (
					baseDir
						? files.map((file) => ({
								...file,
								Path: `${baseDir}${file.Path}`,
							}))
						: files
				).map((file) => {
					const normalizedRemotePath = file.Path.replace(/^\/+/, "").replace(
						/\/$/,
						"",
					);
					const relativeRemotePath =
						normalizedBaseDir &&
						normalizedRemotePath.startsWith(`${normalizedBaseDir}/`)
							? normalizedRemotePath.slice(normalizedBaseDir.length + 1)
							: normalizedRemotePath;
					const restoreStatus =
						restoreStatusMap.get(normalizedRemotePath) ||
						restoreStatusMap.get(relativeRemotePath);
					const storageClass =
						file.StorageClass || restoreStatus?.StorageClass || file.Tier;
					const isArchive = isArchiveStorageClass(storageClass);
					const inProgress =
						restoreStatus?.RestoreStatus?.IsRestoreInProgress === true;
					const restored =
						restoreStatus?.RestoreStatus?.IsRestoreInProgress === false;

					let restoreAvailability: RcloneFile["RestoreAvailability"] =
						"unknown";
					if (file.IsDir) {
						restoreAvailability = "unknown";
					} else if (inProgress) {
						restoreAvailability = "restoring";
					} else if (restored) {
						restoreAvailability = "ready";
					} else if (isArchive) {
						restoreAvailability = "archived";
					} else {
						restoreAvailability = "ready";
					}

					return {
						...file,
						StorageClass: storageClass,
						RestoreAvailability: restoreAvailability,
						RestoreExpiryDate:
							restoreStatus?.RestoreStatus?.RestoreExpiryDate ?? null,
					};
				});

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
	requestBackupFileRestore: protectedProcedure
		.input(
			z.object({
				destinationId: z.string().min(1),
				backupFile: z.string().min(1),
				retrievalTier: z
					.enum(["standard", "priority", "bulk"])
					.default("standard"),
				lifetimeDays: z.number().int().min(1).max(30).default(7),
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const destination = await findDestinationById(input.destinationId);
				const rcloneFlags = getS3Credentials(destination);
				const bucketPath = `:s3:${destination.bucket}`;
				const normalizedPath = input.backupFile.trim().replace(/^\/+/, "");

				if (normalizedPath.endsWith("/")) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Please select a backup file, not a directory.",
					});
				}

				if (!normalizedPath) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Please select a valid backup file path.",
					});
				}

				if (GLOB_PATTERN_CHARS.test(normalizedPath)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Backup file path must be a literal object key and cannot contain wildcard characters.",
					});
				}

				const priority = ARCHIVE_RESTORE_PRIORITY_MAP[input.retrievalTier];
				const restoreCommand = `rclone backend restore ${rcloneFlags.join(" ")} --include ${shEscape(normalizedPath)} ${shEscape(bucketPath)} -o priority=${shEscape(priority)} -o lifetime=${shEscape(String(input.lifetimeDays))}`;

				if (input.serverId) {
					await execAsyncRemote(input.serverId, restoreCommand);
				} else {
					await execAsync(restoreCommand);
				}

				return {
					success: true,
					message: `Archive restore requested for the selected file with ${input.retrievalTier} priority.`,
				};
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}

				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to request archive restore.",
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
		.subscription(async function* ({ input, signal }) {
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

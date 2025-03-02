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
	findMongoByBackupId,
	findMySqlByBackupId,
	findPostgresByBackupId,
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

export const backupRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateBackup)
		.mutation(async ({ input, ctx }) => {
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
	one: protectedProcedure
		.input(apiFindOneBackup)
		.query(async ({ input, ctx }) => {
			const backup = await findBackupById(input.backupId);

			return backup;
		}),
	update: protectedProcedure
		.input(apiUpdateBackup)
		.mutation(async ({ input, ctx }) => {
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
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating this Backup",
				});
			}
		}),
	remove: protectedProcedure
		.input(apiRemoveBackup)
		.mutation(async ({ input, ctx }) => {
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
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error deleting this Backup",
					cause: error,
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
				console.log(error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error running manual Postgres backup ",
					cause: error,
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
});

// export const getAdminId = async (backupId: string) => {
// 	const backup = await findBackupById(backupId);

// 	if (backup.databaseType === "postgres" && backup.postgresId) {
// 		const postgres = await findPostgresById(backup.postgresId);
// 		return postgres.project.adminId;
// 	}
// 	if (backup.databaseType === "mariadb" && backup.mariadbId) {
// 		const mariadb = await findMariadbById(backup.mariadbId);
// 		return mariadb.project.adminId;
// 	}
// 	if (backup.databaseType === "mysql" && backup.mysqlId) {
// 		const mysql = await findMySqlById(backup.mysqlId);
// 		return mysql.project.adminId;
// 	}
// 	if (backup.databaseType === "mongo" && backup.mongoId) {
// 		const mongo = await findMongoById(backup.mongoId);
// 		return mongo.project.adminId;
// 	}

// 	return null;
// };

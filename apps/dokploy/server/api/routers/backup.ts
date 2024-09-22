import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiCreateBackup,
	apiFindOneBackup,
	apiRemoveBackup,
	apiUpdateBackup,
} from "@/server/db/schema";
import { runMariadbBackup } from "@/server/utils/backups/mariadb";
import { runMongoBackup } from "@/server/utils/backups/mongo";
import { runMySqlBackup } from "@/server/utils/backups/mysql";
import { runPostgresBackup } from "@/server/utils/backups/postgres";
import {
	removeScheduleBackup,
	scheduleBackup,
} from "@/server/utils/backups/utils";
import { TRPCError } from "@trpc/server";
import {
	createBackup,
	findBackupById,
	removeBackupById,
	updateBackupById,
} from "../services/backup";
import { findMariadbByBackupId } from "../services/mariadb";
import { findMongoByBackupId } from "../services/mongo";
import { findMySqlByBackupId } from "../services/mysql";
import { findPostgresByBackupId } from "../services/postgres";

export const backupRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateBackup)
		.mutation(async ({ input }) => {
			try {
				const newBackup = await createBackup(input);

				const backup = await findBackupById(newBackup.backupId);

				if (backup.enabled) {
					scheduleBackup(backup);
				}
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the Backup",
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

				if (backup.enabled) {
					removeScheduleBackup(input.backupId);
					scheduleBackup(backup);
				} else {
					removeScheduleBackup(input.backupId);
				}
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to update this Backup",
				});
			}
		}),
	remove: protectedProcedure
		.input(apiRemoveBackup)
		.mutation(async ({ input }) => {
			try {
				const value = await removeBackupById(input.backupId);
				removeScheduleBackup(input.backupId);
				return value;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to delete this Backup",
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
					message: "Error to run manual postgres backup ",
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
					message: "Error to run manual mysql backup ",
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
					message: "Error to run manual mariadb backup ",
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
					message: "Error to run manual mongo backup ",
					cause: error,
				});
			}
		}),
});

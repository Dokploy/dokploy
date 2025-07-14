import { db } from "@dokploy/server/db";
import { type apiCreateBackup, backups } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type Backup = typeof backups.$inferSelect;

export type BackupSchedule = Awaited<ReturnType<typeof findBackupById>>;
export type BackupScheduleList = Awaited<ReturnType<typeof findBackupsByDbId>>;
export const createBackup = async (input: typeof apiCreateBackup._type) => {
	const newBackup = await db
		.insert(backups)
		.values({
			...input,
		})
		.returning()
		.then((value) => value[0]);

	if (!newBackup) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the Backup",
		});
	}

	return newBackup;
};

export const findBackupById = async (backupId: string) => {
	const backup = await db.query.backups.findFirst({
		where: eq(backups.backupId, backupId),
		with: {
			postgres: true,
			mysql: true,
			mariadb: true,
			mongo: true,
			destination: true,
			compose: true,
		},
	});
	if (!backup) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Backup not found",
		});
	}
	return backup;
};

export const updateBackupById = async (
	backupId: string,
	backupData: Partial<Backup>,
) => {
	const result = await db
		.update(backups)
		.set({
			...backupData,
		})
		.where(eq(backups.backupId, backupId))
		.returning();

	return result[0];
};

export const removeBackupById = async (backupId: string) => {
	const result = await db
		.delete(backups)
		.where(eq(backups.backupId, backupId))
		.returning();

	return result[0];
};

export const findBackupsByDbId = async (
	id: string,
	type: "postgres" | "mysql" | "mariadb" | "mongo",
) => {
	const result = await db.query.backups.findMany({
		where: eq(backups[`${type}Id`], id),
		with: {
			postgres: true,
			mysql: true,
			mariadb: true,
			mongo: true,
			destination: true,
		},
	});
	return result || [];
};

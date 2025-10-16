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
                        gpgKey: true,
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
                        gpgKey: true,
                },
        });
        return result || [];
};

interface RestoreBackupLookup {
        destinationId: string;
        backupFile: string;
        databaseId: string;
        databaseType: Backup["databaseType"];
        backupType: Backup["backupType"];
}

const normalizePrefixValue = (value?: string | null) => {
        if (!value) {
                return "";
        }

        return value.trim().replace(/^\/+|\/+$/g, "");
};

const extractNormalizedPrefixFromPath = (backupFile: string) => {
        const withoutBucket = backupFile.replace(/^:s3:[^/]+\//u, "");
        const sanitized = withoutBucket.trim().replace(/^\/+/, "");

        if (!sanitized) {
                return "";
        }

        const segments = sanitized.split("/");

        if (segments.length <= 1) {
                return "";
        }

        segments.pop();
        return segments.join("/");
};

const matchesDatabaseOwner = (
        backup: Backup,
        lookup: RestoreBackupLookup,
) => {
        if (lookup.backupType === "compose") {
                return backup.composeId === lookup.databaseId;
        }

        switch (lookup.databaseType) {
                case "postgres":
                        return backup.postgresId === lookup.databaseId;
                case "mysql":
                        return backup.mysqlId === lookup.databaseId;
                case "mariadb":
                        return backup.mariadbId === lookup.databaseId;
                case "mongo":
                        return backup.mongoId === lookup.databaseId;
                case "web-server":
                        return backup.userId === lookup.databaseId;
                default:
                        return false;
        }
};

const pickPreferredBackup = <T extends { gpgKeyId: string | null | undefined }>(
        candidates: T[],
) => {
        if (candidates.length === 0) {
                return undefined;
        }

        return (
                candidates.find((candidate) => candidate.gpgKeyId) || candidates[0]
        );
};

export const findBackupForRestore = async (
        lookup: RestoreBackupLookup,
) => {
        const candidates = await db.query.backups.findMany({
                where: eq(backups.destinationId, lookup.destinationId),
                with: { gpgKey: true },
        });

        const relevantBackups = candidates.filter(
                (candidate) =>
                        candidate.backupType === lookup.backupType &&
                        candidate.databaseType === lookup.databaseType &&
                        matchesDatabaseOwner(candidate, lookup),
        );

        if (relevantBackups.length === 0) {
                return undefined;
        }

        const filePrefix = extractNormalizedPrefixFromPath(lookup.backupFile);

        if (filePrefix) {
                const matchingPrefix = relevantBackups.filter(
                        (candidate) =>
                                normalizePrefixValue(candidate.prefix) === filePrefix,
                );

                const preferred = pickPreferredBackup(matchingPrefix);

                if (preferred) {
                        return preferred;
                }
        }

        if (!filePrefix) {
                const emptyPrefix = relevantBackups.filter(
                        (candidate) => normalizePrefixValue(candidate.prefix) === "",
                );
                const preferred = pickPreferredBackup(emptyPrefix);
                if (preferred) {
                        return preferred;
                }
        }

        return pickPreferredBackup(relevantBackups);
};

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db";
import {
        type createVolumeBackupSchema,
        type updateVolumeBackupSchema,
        volumeBackups,
} from "../db/schema";

export const findVolumeBackupById = async (volumeBackupId: string) => {
	const volumeBackup = await db.query.volumeBackups.findFirst({
		where: eq(volumeBackups.volumeBackupId, volumeBackupId),
                with: {
                        application: true,
                        postgres: true,
                        mysql: true,
                        mariadb: true,
                        mongo: true,
                        redis: true,
                        compose: true,
                        destination: true,
                        gpgKey: true,
                },
        });

	if (!volumeBackup) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Volume backup not found",
		});
	}

	return volumeBackup;
};

export const createVolumeBackup = async (
	volumeBackup: z.infer<typeof createVolumeBackupSchema>,
) => {
	const newVolumeBackup = await db
		.insert(volumeBackups)
		.values(volumeBackup)
		.returning()
		.then((e) => e[0]);

	return newVolumeBackup;
};

export const removeVolumeBackup = async (volumeBackupId: string) => {
	await db
		.delete(volumeBackups)
		.where(eq(volumeBackups.volumeBackupId, volumeBackupId));
};

export const updateVolumeBackup = async (
        volumeBackupId: string,
        volumeBackup: z.infer<typeof updateVolumeBackupSchema>,
) => {
        return await db
                .update(volumeBackups)
                .set(volumeBackup)
                .where(eq(volumeBackups.volumeBackupId, volumeBackupId))
                .returning()
                .then((e) => e[0]);
};

interface VolumeRestoreLookup {
        destinationId: string;
        backupFile: string;
        serviceId: string;
        serviceType: NonNullable<typeof volumeBackups.$inferSelect.serviceType>;
        volumeName: string;
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

const matchesVolumeOwner = (
        volumeBackup: typeof volumeBackups.$inferSelect,
        lookup: VolumeRestoreLookup,
) => {
        switch (lookup.serviceType) {
                case "application":
                        return volumeBackup.applicationId === lookup.serviceId;
                case "compose":
                        return volumeBackup.composeId === lookup.serviceId;
                case "postgres":
                        return volumeBackup.postgresId === lookup.serviceId;
                case "mysql":
                        return volumeBackup.mysqlId === lookup.serviceId;
                case "mariadb":
                        return volumeBackup.mariadbId === lookup.serviceId;
                case "mongo":
                        return volumeBackup.mongoId === lookup.serviceId;
                case "redis":
                        return volumeBackup.redisId === lookup.serviceId;
                default:
                        return false;
        }
};

const pickPreferredVolumeBackup = <
        T extends { gpgKeyId: string | null | undefined }
>(candidates: T[]) => {
        if (candidates.length === 0) {
                return undefined;
        }

        return (
                candidates.find((candidate) => candidate.gpgKeyId) || candidates[0]
        );
};

export const findVolumeBackupForRestore = async (
        lookup: VolumeRestoreLookup,
) => {
        const candidates = await db.query.volumeBackups.findMany({
                where: eq(volumeBackups.destinationId, lookup.destinationId),
                with: { gpgKey: true },
        });

        const relevantBackups = candidates.filter(
                (candidate) =>
                        candidate.volumeName === lookup.volumeName &&
                        candidate.serviceType === lookup.serviceType &&
                        matchesVolumeOwner(candidate, lookup),
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

                const preferred = pickPreferredVolumeBackup(matchingPrefix);
                if (preferred) {
                        return preferred;
                }
        }

        if (!filePrefix) {
                const emptyPrefix = relevantBackups.filter(
                        (candidate) => normalizePrefixValue(candidate.prefix) === "",
                );
                const preferred = pickPreferredVolumeBackup(emptyPrefix);
                if (preferred) {
                        return preferred;
                }
        }

        return pickPreferredVolumeBackup(relevantBackups);
};

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db";
import {
	type createVolumeBackupSchema,
	type updateVolumeBackupSchema,
	volumeBackups,
} from "../db/schema";
import { findApplicationById } from "./application";
import { findComposeById } from "./compose";

export const findVolumeBackupById = async (volumeBackupId: string) => {
	const volumeBackup = await db.query.volumeBackups.findFirst({
		where: eq(volumeBackups.volumeBackupId, volumeBackupId),
		with: {
			application: {
				columns: {
					applicationId: true,
					appName: true,
					serverId: true,
				},
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			},
			postgres: {
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			},
			mysql: {
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			},
			mariadb: {
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			},
			mongo: {
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			},
			redis: {
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			},
			compose: {
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			},
			libsql: {
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			},
			destination: {
				columns: {
					accessKey: false,
					secretAccessKey: false,
				},
			},
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
		.values(volumeBackup as typeof volumeBackups.$inferInsert)
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
		.set(volumeBackup as Partial<typeof volumeBackups.$inferInsert>)
		.where(eq(volumeBackups.volumeBackupId, volumeBackupId))
		.returning()
		.then((e) => e[0]);
};

// Compose volumes can be renamed (`name:`) or external, so a volume this
// service already backs up also counts as its own.
export const findServiceOwningVolume = async (
	id: string,
	serviceType: "application" | "compose",
	volumeName: string,
) => {
	const service =
		serviceType === "application"
			? await findApplicationById(id)
			: await findComposeById(id);
	const backedUp = await db.query.volumeBackups.findFirst({
		where: and(
			eq(
				serviceType === "application"
					? volumeBackups.applicationId
					: volumeBackups.composeId,
				id,
			),
			eq(volumeBackups.volumeName, volumeName),
		),
		columns: { volumeBackupId: true },
	});
	const ownsVolume =
		!!backedUp ||
		service.mounts.some(
			(mount) => mount.type === "volume" && mount.volumeName === volumeName,
		) ||
		(serviceType === "compose" && volumeName.startsWith(`${service.appName}_`));
	if (!ownsVolume) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "This volume does not belong to the service.",
		});
	}
	return service;
};

import { randomUUID } from "node:crypto";
import { db } from "@dokploy/server/db";
import { cloudStorageBackup } from "@dokploy/server/db/schema/cloud-storage-backup";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type CloudStorageBackup = typeof cloudStorageBackup.$inferSelect;

export const cloudStorageBackupService = {
	createBackup: async (data: {
		organizationId: string;
		schedule: string;
		enabled: boolean;
		databaseType: string;
		cloudStorageDestinationId: string;
		prefix?: string;
		database?: string;
		postgresId?: string;
		mysqlId?: string;
		mariadbId?: string;
		mongoId?: string;
	}) => {
		console.log("Creating backup with data:", data);

		const backupData = {
			...data,
			id: randomUUID(),
		};

		console.log("Backup data to insert:", backupData);

		try {
			const [backup] = await db
				.insert(cloudStorageBackup)
				.values(backupData)
				.returning();

			console.log("Successfully created backup:", backup);
			return backup;
		} catch (error) {
			console.error("Error creating backup:", error);
			throw error;
		}
	},

	updateBackup: async (
		id: string,
		data: {
			schedule?: string;
			enabled?: boolean;
			databaseType?: string;
			cloudStorageDestinationId?: string;
			prefix?: string;
			database?: string;
			postgresId?: string;
			mysqlId?: string;
			mariadbId?: string;
			mongoId?: string;
		},
	) => {
		const [backup] = await db
			.update(cloudStorageBackup)
			.set(data)
			.where(eq(cloudStorageBackup.id, id))
			.returning();

		return backup;
	},

	removeBackup: async (id: string) => {
		const [backup] = await db
			.delete(cloudStorageBackup)
			.where(eq(cloudStorageBackup.id, id))
			.returning();

		return backup;
	},

	findBackupById: async (id: string) => {
		const backup = await db.query.cloudStorageBackup.findFirst({
			where: eq(cloudStorageBackup.id, id),
			with: {
				cloudStorageDestination: true,
			},
		});
		if (!backup) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Backup not found",
			});
		}
		return backup;
	},

	listBackups: async (organizationId: string) => {
		console.log("Listing backups for organization:", organizationId);
		const backups = await db
			.select()
			.from(cloudStorageBackup)
			.where(eq(cloudStorageBackup.organizationId, organizationId));
		console.log("Found backups:", backups);
		return backups;
	},
};

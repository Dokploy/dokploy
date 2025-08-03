import { writeFileSync } from "node:fs";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { cloudStorageBackup } from "@dokploy/server/db/schema/cloud-storage-backup";
import { cloudStorageDestination } from "@dokploy/server/db/schema/cloud-storage-destination";
import { generateProviderConfig } from "@dokploy/server/db/schema/cloud-storage-destination";
import { cloudStorageBackupService } from "@dokploy/server/services/cloud-storage-backup";
import {
	type CloudStorageProvider,
	getRcloneConfigPath,
	normalizeCloudPath,
} from "@dokploy/server/utils/backups/cloud-storage";
import {
	executeCloudStorageBackup,
	executeCloudStorageRestore,
} from "@dokploy/server/utils/backups/cloud-storage";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { z } from "zod";

const listBackupFilesInput = z.object({
	destinationId: z.string(),
	prefix: z.string().optional(),
	searchTerm: z.string().optional(),
	serverId: z.string().optional(),
});

const createBackupInput = z.object({
	schedule: z.string(),
	enabled: z.boolean(),
	databaseType: z.enum(["postgres", "mariadb", "mysql", "mongo", "web-server"]),
	cloudStorageDestinationId: z.string(),
	prefix: z.string().optional(),
	database: z.string().optional(),
	postgresId: z.string().optional(),
	mysqlId: z.string().optional(),
	mariadbId: z.string().optional(),
	mongoId: z.string().optional(),
});

const updateBackupInput = z.object({
	backupId: z.string(),
	schedule: z.string().optional(),
	enabled: z.boolean().optional(),
	databaseType: z
		.enum(["postgres", "mariadb", "mysql", "mongo", "web-server"])
		.optional(),
	cloudStorageDestinationId: z.string().optional(),
	prefix: z.string().optional(),
	database: z.string().optional(),
	postgresId: z.string().optional(),
	mysqlId: z.string().optional(),
	mariadbId: z.string().optional(),
	mongoId: z.string().optional(),
	keepLatestCount: z.number().optional(),
});

const manualBackupInput = z.object({
	backupId: z.string(),
});

// Helper to perform an operation with silent token refresh for OAuth providers
async function withSilentTokenRefresh(params: {
	ctx: any;
	destination: any;
	operationFn: (destination: any) => Promise<any>;
	updateConfig?: boolean;
}): Promise<any> {
	const { ctx, destination, operationFn, updateConfig = true } = params;
	const provider = destination.provider;
	if (["drive", "dropbox", "box"].includes(provider)) {
		let credentials: Record<string, unknown> = {};
		try {
			credentials = destination.config ? JSON.parse(destination.config) : {};
		} catch {}
		const configPath = getRcloneConfigPath(
			ctx.session.activeOrganizationId,
			destination.id,
		);

		// Use existing token if available
		if (credentials.token) {
			try {
				const configContent = generateProviderConfig(provider, credentials);
				writeFileSync(configPath, configContent);
				return await operationFn(destination);
			} catch (err: any) {
				if (
					err.stderr &&
					(err.stderr.includes("token expired") ||
						err.stderr.includes("invalid_grant") ||
						err.stderr.includes("unauthorized") ||
						err.stderr.includes("401") ||
						err.stderr.includes("403"))
				) {
					console.log("Token expired or invalid, attempting refresh");
					credentials.token = undefined;
					// Update the config in database to reflect token removal
					if (updateConfig) {
						await db
							.update(cloudStorageDestination)
							.set({
								config: JSON.stringify(credentials),
								updatedAt: new Date(),
							})
							.where(eq(cloudStorageDestination.id, destination.id));
					}
				} else {
					throw err;
				}
			}
		}

		console.log("Getting new token through OAuth flow");
		const {
			testCloudStorageConnection,
		} = require("./cloud-storage-destination");
		const result = await testCloudStorageConnection({
			provider,
			credentials,
			destinationId: destination.id,
			ctx,
		});

		if (result.token) {
			credentials.token = result.token;
			if (updateConfig) {
				await db
					.update(cloudStorageDestination)
					.set({ config: JSON.stringify(credentials), updatedAt: new Date() })
					.where(eq(cloudStorageDestination.id, destination.id));
			}
			const configContent = generateProviderConfig(provider, credentials);
			writeFileSync(configPath, configContent);
			return await operationFn({
				...destination,
				config: JSON.stringify(credentials),
			});
		}
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Failed to get new token. Please reconnect this destination.",
		});
	}
	return await operationFn(destination);
}

export const cloudStorageBackupRouter = createTRPCRouter({
	listBackupFiles: protectedProcedure
		.input(listBackupFilesInput)
		.query(async ({ input, ctx }) => {
			const { destinationId, prefix, searchTerm, serverId } = input;

			const [destination] = await db
				.select()
				.from(cloudStorageDestination)
				.where(eq(cloudStorageDestination.id, destinationId))
				.limit(1);

			if (!destination) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud storage destination not found",
				});
			}

			if (destination.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this destination",
				});
			}

			if (!destination.provider) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Destination is not a valid cloud storage provider",
				});
			}

			const provider = destination.provider as CloudStorageProvider;

			// Use withSilentTokenRefresh to handle OAuth token refresh
			return await withSilentTokenRefresh({
				ctx,
				destination,
				operationFn: async (dest) => {
					const configPath = getRcloneConfigPath(
						ctx.session.activeOrganizationId,
						dest.id,
					);

					let credentials: Record<string, unknown>;
					try {
						credentials = dest.config ? JSON.parse(dest.config) : {};
					} catch (_e) {
						credentials = {};
					}

					const configContent = generateProviderConfig(provider, credentials);
					writeFileSync(configPath, configContent);

					const normalizedPrefix =
						prefix === "/" ? "" : normalizeCloudPath(prefix || "");

					const rcloneRemote = provider;

					const command = `rclone lsjson --config=${configPath} "${rcloneRemote}:${normalizedPrefix}"`;
					console.log("Executing rclone command:", command);

					try {
						const { stdout } = serverId
							? await execAsyncRemote(serverId, command)
							: await execAsync(command);

						console.log("Rclone output:", stdout);

						const files = JSON.parse(stdout) as Array<{
							Path: string;
							Name: string;
							Size: number;
							ModTime: string;
							IsDir: boolean;
							Hashes: { MD5: string };
						}>;

						console.log("Parsed files:", files);

						const backupFiles = files
							.filter(
								(file) =>
									file.Name.endsWith(".zip") || file.Name.endsWith(".sql.gz"),
							)
							.map((file) => ({
								path: file.Path,
								name: file.Name,
								size: file.Size,
								lastModified: new Date(file.ModTime),
								isDir: file.IsDir,
								hashes: file.Hashes,
							}));

						console.log("Filtered backup files:", backupFiles);

						if (searchTerm) {
							const filteredFiles = backupFiles.filter((file) =>
								file.name.toLowerCase().includes(searchTerm.toLowerCase()),
							);
							console.log("Search filtered files:", filteredFiles);
							return filteredFiles;
						}

						return backupFiles;
					} catch (error: any) {
						if (error.stderr?.includes("directory not found")) {
							console.log("Directory not found, returning empty array");
							return [];
						}
						console.error("Error listing cloud storage backup files:", error);
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "Failed to list cloud storage backup files",
							cause: error,
						});
					}
				},
			});
		}),

	create: protectedProcedure
		.input(createBackupInput)
		.mutation(async ({ input, ctx }) => {
			const { cloudStorageDestinationId, ...data } = input;

			const [destination] = await db
				.select()
				.from(cloudStorageDestination)
				.where(eq(cloudStorageDestination.id, cloudStorageDestinationId))
				.limit(1);

			if (!destination) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud storage destination not found",
				});
			}

			if (destination.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this destination",
				});
			}

			const backup = await cloudStorageBackupService.createBackup({
				...data,
				cloudStorageDestinationId,
				organizationId: ctx.session.activeOrganizationId,
			});

			return backup;
		}),

	update: protectedProcedure
		.input(updateBackupInput)
		.mutation(async ({ input, ctx }) => {
			const { backupId, cloudStorageDestinationId, ...data } = input;

			if (cloudStorageDestinationId) {
				const [destination] = await db
					.select()
					.from(cloudStorageDestination)
					.where(eq(cloudStorageDestination.id, cloudStorageDestinationId))
					.limit(1);

				if (!destination) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Cloud storage destination not found",
					});
				}

				if (destination.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to access this destination",
					});
				}
			}

			return await cloudStorageBackupService.updateBackup(backupId, {
				...data,
				cloudStorageDestinationId,
			});
		}),

	remove: protectedProcedure
		.input(z.object({ backupId: z.string() }))
		.mutation(async ({ input }) => {
			return await cloudStorageBackupService.removeBackup(input.backupId);
		}),

	list: protectedProcedure.query(async () => {
		const backups = await db.query.cloudStorageBackup.findMany({
			with: {
				cloudStorageDestination: true,
			},
		});
		return backups;
	}),

	get: protectedProcedure
		.input(z.object({ backupId: z.string() }))
		.query(async ({ input }) => {
			const backup = await db.query.cloudStorageBackup.findFirst({
				where: eq(cloudStorageBackup.id, input.backupId),
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
		}),

	manualBackup: protectedProcedure
		.input(manualBackupInput)
		.mutation(async ({ input, ctx }) => {
			const { backupId } = input;
			const backup = await cloudStorageBackupService.findBackupById(backupId);
			if (backup.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this backup",
				});
			}
			const [destination] = await db
				.select()
				.from(cloudStorageDestination)
				.where(eq(cloudStorageDestination.id, backup.cloudStorageDestinationId))
				.limit(1);
			if (!destination) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud storage destination not found",
				});
			}
			if (destination.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this destination",
				});
			}
			const doBackup = async (dest: any) => {
				switch (backup.databaseType) {
					case "web-server":
						return await executeCloudStorageBackup(
							{ ...backup, webServer: { path: backup.database || "" } },
							dest,
						);
					case "postgres":
						return await executeCloudStorageBackup(
							{
								...backup,
								postgres: {
									host: "localhost",
									port: 5432,
									user: "postgres",
									password: "",
								},
							},
							dest,
						);
					case "mysql":
						return await executeCloudStorageBackup(
							{
								...backup,
								mysql: {
									host: "localhost",
									port: 3306,
									user: "root",
									password: "",
								},
							},
							dest,
						);
					case "mariadb":
						return await executeCloudStorageBackup(
							{
								...backup,
								mariadb: {
									host: "localhost",
									port: 3306,
									user: "root",
									password: "",
								},
							},
							dest,
						);
					case "mongo":
						return await executeCloudStorageBackup(
							{
								...backup,
								mongo: {
									host: "localhost",
									port: 27017,
									user: "",
									password: "",
								},
							},
							dest,
						);
					default:
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Unsupported database type for manual backup",
						});
				}
			};
			try {
				await withSilentTokenRefresh({
					ctx,
					destination,
					operationFn: doBackup,
				});
				return { success: true };
			} catch (error) {
				console.error("Manual backup error:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to execute manual backup",
					cause: error,
				});
			}
		}),

	restore: protectedProcedure
		.input(
			z.object({
				destinationId: z.string(),
				backupFile: z.string(),
				databaseType: z
					.enum(["postgres", "mariadb", "mysql", "mongo", "web-server"])
					.optional(),
				databaseName: z.string().optional(),
				metadata: z.any().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const destination = await db.query.cloudStorageDestination.findFirst({
				where: eq(cloudStorageDestination.id, input.destinationId),
			});
			if (!destination) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Destination not found",
				});
			}
			const backup = await db.query.cloudStorageBackup.findFirst({
				where: eq(
					cloudStorageBackup.cloudStorageDestinationId,
					input.destinationId,
				),
			});
			if (!backup) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "No backup found for this destination",
				});
			}

			const configPath = getRcloneConfigPath(
				ctx.session.activeOrganizationId,
				destination.id,
			);

			let credentials: Record<string, unknown>;
			try {
				credentials = destination.config ? JSON.parse(destination.config) : {};
			} catch (_e) {
				credentials = {};
			}

			const configContent = generateProviderConfig(
				destination.provider as CloudStorageProvider,
				credentials,
			);
			writeFileSync(configPath, configContent);

			const doRestore = async (dest: any) => {
				const backupWithConfig = {
					...backup,
					webServer:
						input.databaseType === "web-server"
							? { path: input.databaseName || "/var/www/html" }
							: undefined,
					postgres:
						input.databaseType === "postgres"
							? {
									host: "localhost",
									port: 5432,
									user: input.metadata?.postgres?.databaseUser || "postgres",
									password: "",
								}
							: undefined,
					mysql:
						input.databaseType === "mysql"
							? {
									host: "localhost",
									port: 3306,
									user: "root",
									password: input.metadata?.mysql?.databaseRootPassword || "",
								}
							: undefined,
					mariadb:
						input.databaseType === "mariadb"
							? {
									host: "localhost",
									port: 3306,
									user: input.metadata?.mariadb?.databaseUser || "root",
									password: input.metadata?.mariadb?.databasePassword || "",
								}
							: undefined,
					mongo:
						input.databaseType === "mongo"
							? {
									host: "localhost",
									port: 27017,
									user: input.metadata?.mongo?.databaseUser || "",
									password: input.metadata?.mongo?.databasePassword || "",
								}
							: undefined,
				};
				return await executeCloudStorageRestore(
					backupWithConfig,
					dest,
					input.backupFile,
					() => {},
				);
			};
			try {
				await withSilentTokenRefresh({
					ctx,
					destination,
					operationFn: doRestore,
				});
				return { success: true };
			} catch (error) {
				console.error("Restore error:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error ? error.message : "Failed to restore backup",
					cause: error,
				});
			}
		}),

	restoreBackupWithLogs: protectedProcedure
		.input(
			z.object({
				databaseId: z.string(),
				databaseType: z.enum([
					"postgres",
					"mariadb",
					"mysql",
					"mongo",
					"web-server",
				]),
				databaseName: z.string(),
				backupFile: z.string(),
				destinationId: z.string(),
				metadata: z.any().optional(),
			}),
		)
		.subscription(async () => {
			return observable<string>((_emit) => {
				// Implementation will be added
				return () => {};
			});
		}),
});

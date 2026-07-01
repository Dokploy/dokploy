import {
	createBackup,
	findBackupById,
	findComposeByBackupId,
	findComposeById,
	findLibsqlByBackupId,
	findLibsqlById,
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
	runLibsqlBackup,
	runMariadbBackup,
	runMongoBackup,
	runMySqlBackup,
	runPostgresBackup,
	runWebServerBackup,
	scheduleBackup,
	updateBackupById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { backups, volumeBackups } from "@dokploy/server/db/schema";
import {
	checkPermission,
	checkServicePermissionAndAccess,
} from "@dokploy/server/services/permission";
import { runComposeBackup } from "@dokploy/server/utils/backups/compose";
import {
	assertRcloneS3DestinationAllowed,
	buildRcloneS3Command,
	getRcloneS3Destination,
	normalizeS3Path,
} from "@dokploy/server/utils/backups/utils";
import { normalizeRelativeFilePath } from "@dokploy/server/utils/filesystem/safe-path";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import {
	restoreComposeBackup,
	restoreLibsqlBackup,
	restoreMariadbBackup,
	restoreMongoBackup,
	restoreMySqlBackup,
	restorePostgresBackup,
	restoreWebServerBackup,
} from "@dokploy/server/utils/restore";
import { normalizeRestoreBackupFile } from "@dokploy/server/utils/restore/safe-input";
import { signScheduledQueueJob } from "@dokploy/server/utils/schedules/signed-job";
import {
	isRedactedSecretValue,
	redactBackupScheduleSecrets,
} from "@dokploy/server/utils/security/redaction";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import { assertDestinationAccess } from "@/server/api/utils/destination-access";
import { assertTargetServerAccess } from "@/server/api/utils/placement-access";
import {
	apiCreateBackup,
	apiFindOneBackup,
	apiRemoveBackup,
	apiRestoreBackup,
	apiUpdateBackup,
} from "@/server/db/schema";
import {
	removeJob,
	removeSignedJob,
	schedule,
	updateJob,
} from "@/server/utils/backup";

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

type BackupAction = "create" | "read" | "update" | "delete" | "restore";
type BackupScheduleWithRelations = Awaited<ReturnType<typeof findBackupById>>;
type RestoreBackupInput = z.infer<typeof apiRestoreBackup>;
type BackupMetadataInput = z.infer<typeof apiUpdateBackup>["metadata"];
type BackupAccessCtx = {
	session: { userId: string; activeOrganizationId: string };
	user: { id: string; role: string };
};

const preserveBackupSecretValue = (value: string, existingValue?: string) =>
	isRedactedSecretValue(value) ? (existingValue ?? "") : value;

const preserveBackupMetadataSecrets = (
	metadata: BackupMetadataInput,
	existingMetadata: BackupMetadataInput,
) => {
	if (!metadata) {
		return metadata;
	}

	return {
		...existingMetadata,
		...metadata,
		postgres: metadata.postgres ?? existingMetadata?.postgres,
		mariadb:
			metadata.mariadb || existingMetadata?.mariadb
				? {
						databaseUser:
							metadata.mariadb?.databaseUser ??
							existingMetadata?.mariadb?.databaseUser ??
							"",
						databasePassword: metadata.mariadb
							? preserveBackupSecretValue(
									metadata.mariadb.databasePassword,
									existingMetadata?.mariadb?.databasePassword,
								)
							: (existingMetadata?.mariadb?.databasePassword ?? ""),
					}
				: metadata.mariadb,
		mongo:
			metadata.mongo || existingMetadata?.mongo
				? {
						databaseUser:
							metadata.mongo?.databaseUser ??
							existingMetadata?.mongo?.databaseUser ??
							"",
						databasePassword: metadata.mongo
							? preserveBackupSecretValue(
									metadata.mongo.databasePassword,
									existingMetadata?.mongo?.databasePassword,
								)
							: (existingMetadata?.mongo?.databasePassword ?? ""),
					}
				: metadata.mongo,
		mysql:
			metadata.mysql || existingMetadata?.mysql
				? {
						databaseRootPassword: metadata.mysql
							? preserveBackupSecretValue(
									metadata.mysql.databaseRootPassword,
									existingMetadata?.mysql?.databaseRootPassword,
								)
							: (existingMetadata?.mysql?.databaseRootPassword ?? ""),
					}
				: metadata.mysql,
	};
};

const backupServiceIdFields = [
	"postgresId",
	"mysqlId",
	"mariadbId",
	"mongoId",
	"libsqlId",
	"composeId",
] as const;
type BackupServiceIdShape = {
	[K in (typeof backupServiceIdFields)[number]]?: string | null;
};

const backupServiceFieldByDatabaseType = {
	libsql: "libsqlId",
	mariadb: "mariadbId",
	mongo: "mongoId",
	mysql: "mysqlId",
	postgres: "postgresId",
} as const;

const getBackupServiceBindings = (backup: BackupServiceIdShape) => {
	const bindings: {
		field: (typeof backupServiceIdFields)[number];
		id: string;
	}[] = [];
	for (const field of backupServiceIdFields) {
		const id = backup[field];
		if (id) {
			bindings.push({ field, id });
		}
	}
	return bindings;
};

const assertBoundBackupService = (
	backup: BackupServiceIdShape & {
		backupType: "database" | "compose";
		databaseType: BackupScheduleWithRelations["databaseType"];
	},
) => {
	const bindings = getBackupServiceBindings(backup);

	if (backup.backupType === "compose") {
		if (
			bindings.length !== 1 ||
			bindings[0]?.field !== "composeId" ||
			!backup.composeId
		) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Compose backups must be linked only to a compose service.",
			});
		}
		return backup.composeId;
	}

	if (backup.databaseType === "web-server") {
		if (bindings.length !== 0) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Server backups must not be linked to a service.",
			});
		}
		return null;
	}

	const expectedField = backupServiceFieldByDatabaseType[backup.databaseType];
	const serviceId = backup[expectedField];
	if (
		bindings.length !== 1 ||
		!serviceId ||
		bindings[0]?.field !== expectedField
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Backup must be linked only to the selected service type.",
		});
	}

	return serviceId;
};

type BoundBackupServiceInput = Parameters<typeof assertBoundBackupService>[0];

const toBoundBackupServiceInput = (
	backup: BackupServiceIdShape & {
		backupType?: unknown;
		databaseType: BackupScheduleWithRelations["databaseType"];
	},
): BoundBackupServiceInput => ({
	postgresId: backup.postgresId,
	mysqlId: backup.mysqlId,
	mariadbId: backup.mariadbId,
	mongoId: backup.mongoId,
	libsqlId: backup.libsqlId,
	composeId: backup.composeId,
	backupType: backup.backupType === "compose" ? "compose" : "database",
	databaseType: backup.databaseType,
});

const assertOwnerOrAdmin = (
	ctx: { user: { role: string } },
	message: string,
) => {
	if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message,
		});
	}
};

const assertWebServerBackupAccess = async (
	ctx: BackupAccessCtx,
	backup: Pick<BackupScheduleWithRelations, "destinationId" | "databaseType">,
	action: BackupAction,
) => {
	if (backup.databaseType !== "web-server") {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Backup is not linked to an accessible service.",
		});
	}

	assertOwnerOrAdmin(ctx, `You don't have access to ${action} server backups.`);
	await assertDestinationAccess(
		backup.destinationId,
		ctx.session.activeOrganizationId,
	);
};

const assertBackupAccess = async (
	ctx: BackupAccessCtx,
	backup: BackupScheduleWithRelations,
	action: BackupAction,
) => {
	const serviceId = assertBoundBackupService(backup);
	if (serviceId) {
		await checkServicePermissionAndAccess(ctx, serviceId, {
			backup: [action],
		});
		return;
	}

	await assertWebServerBackupAccess(ctx, backup, action);
};

const assertBackupListingAccess = async (
	ctx: BackupAccessCtx,
	backup: BackupServiceIdShape & {
		destinationId: string;
		databaseType: BackupScheduleWithRelations["databaseType"];
		backupType: "database" | "compose";
	},
) => {
	const serviceId = assertBoundBackupService(backup);
	if (serviceId) {
		await checkServicePermissionAndAccess(ctx, serviceId, {
			backup: ["read"],
		});
		return;
	}

	await assertWebServerBackupAccess(ctx, backup, "read");
};

const getRestoreObjectExtension = (input: RestoreBackupInput) => {
	if (input.backupType === "compose") {
		return input.databaseType === "mongo" ? [".bson.gz"] : [".sql.gz"];
	}
	if (input.databaseType === "web-server") {
		return [".zip"];
	}
	return input.databaseType === "mongo" ? [".bson.gz"] : [".sql.gz"];
};

const getRestoreServiceAppName = (
	backup: Pick<
		BackupScheduleWithRelations,
		| "appName"
		| "serviceName"
		| "compose"
		| "postgres"
		| "mysql"
		| "mariadb"
		| "mongo"
		| "libsql"
	>,
) => {
	if (backup.compose?.appName) {
		return backup.serviceName
			? `${backup.compose.appName}_${backup.serviceName}`
			: backup.compose.appName;
	}

	return (
		backup.postgres?.appName ||
		backup.mysql?.appName ||
		backup.mariadb?.appName ||
		backup.mongo?.appName ||
		backup.libsql?.appName ||
		backup.appName
	);
};

const isBackupObjectBoundToSchedule = (
	backup: Pick<
		BackupScheduleWithRelations,
		| "appName"
		| "prefix"
		| "serviceName"
		| "compose"
		| "postgres"
		| "mysql"
		| "mariadb"
		| "mongo"
		| "libsql"
	>,
	objectPath: string,
) => {
	const expectedPrefix = `${getRestoreServiceAppName(backup)}/${normalizeS3Path(
		backup.prefix,
	)}`;
	const suffix = objectPath.slice(expectedPrefix.length);
	return objectPath.startsWith(expectedPrefix) && suffix.length > 0;
};

const restoreServiceFieldByDatabaseType = {
	libsql: "libsqlId",
	mariadb: "mariadbId",
	mongo: "mongoId",
	mysql: "mysqlId",
	postgres: "postgresId",
} as const;

const assertRestoreBackupObjectBound = async (
	input: RestoreBackupInput,
	databaseId: string,
) => {
	const { objectPath } = normalizeRestoreBackupFile(
		input.backupFile,
		getRestoreObjectExtension(input),
	);

	const sharedWhere = [
		eq(backups.destinationId, input.destinationId),
		eq(backups.backupType, input.backupType),
		eq(backups.databaseType, input.databaseType),
	];

	if (input.backupType === "compose") {
		sharedWhere.push(eq(backups.composeId, databaseId));
	} else if (input.databaseType !== "web-server") {
		sharedWhere.push(
			eq(
				backups[restoreServiceFieldByDatabaseType[input.databaseType]],
				databaseId,
			),
		);
	}

	const candidateBackups = await db.query.backups.findMany({
		where: and(...sharedWhere),
		with: {
			compose: true,
			destination: {
				columns: {
					accessKey: false,
					secretAccessKey: false,
				},
			},
			libsql: true,
			mariadb: true,
			mongo: true,
			mysql: true,
			postgres: true,
		},
	});

	if (
		!candidateBackups.some((backup) =>
			isBackupObjectBoundToSchedule(backup, objectPath),
		)
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Backup file is not linked to this backup schedule.",
		});
	}
};

const volumeBackupServiceIdFields = [
	"applicationId",
	"postgresId",
	"mysqlId",
	"mariadbId",
	"mongoId",
	"redisId",
	"libsqlId",
	"composeId",
] as const;
type VolumeBackupServiceIdShape = {
	[K in (typeof volumeBackupServiceIdFields)[number]]?: string | null;
};

const getVolumeBackupServiceId = (backup: VolumeBackupServiceIdShape) => {
	for (const field of volumeBackupServiceIdFields) {
		if (backup[field]) {
			return backup[field];
		}
	}
};

const getVolumeRestoreServiceAppName = (backup: {
	appName: string;
	serviceName?: string | null;
	application?: { appName: string } | null;
	compose?: { appName: string } | null;
}) => {
	if (backup.compose?.appName) {
		return backup.serviceName
			? `${backup.compose.appName}_${backup.serviceName}`
			: backup.compose.appName;
	}

	return backup.application?.appName || backup.appName;
};

const skipInaccessibleSchedule = (error: unknown) => {
	if (
		error instanceof TRPCError &&
		(error.code === "UNAUTHORIZED" || error.code === "NOT_FOUND")
	) {
		return true;
	}
	return false;
};

const getAccessibleBackupListingPrefixes = async (
	ctx: BackupAccessCtx,
	destinationId: string,
) => {
	const prefixes = new Set<string>();
	const backupSchedules = await db.query.backups.findMany({
		where: eq(backups.destinationId, destinationId),
		with: {
			compose: true,
			libsql: true,
			mariadb: true,
			mongo: true,
			mysql: true,
			postgres: true,
		},
	});

	for (const backup of backupSchedules) {
		try {
			await assertBackupListingAccess(ctx, backup);
			prefixes.add(
				`${getRestoreServiceAppName(backup)}/${normalizeS3Path(backup.prefix)}`,
			);
		} catch (error) {
			if (!skipInaccessibleSchedule(error)) {
				throw error;
			}
		}
	}

	const volumeBackupSchedules = await db.query.volumeBackups.findMany({
		where: eq(volumeBackups.destinationId, destinationId),
		with: {
			application: true,
			compose: true,
		},
	});

	for (const backup of volumeBackupSchedules) {
		const serviceId = getVolumeBackupServiceId(backup);
		if (!serviceId) {
			continue;
		}
		try {
			await checkServicePermissionAndAccess(ctx, serviceId, {
				volumeBackup: ["read"],
			});
			prefixes.add(
				`${getVolumeRestoreServiceAppName(backup)}/${normalizeS3Path(
					backup.prefix,
				)}`,
			);
		} catch (error) {
			if (!skipInaccessibleSchedule(error)) {
				throw error;
			}
		}
	}

	return [...prefixes];
};

const isRemoteBackupListingServer = (serverId?: string) => Boolean(serverId);

const assertBackupListingServerAccess = async (
	ctx: BackupAccessCtx,
	serverId?: string,
) => {
	await assertTargetServerAccess(ctx, serverId);

	if (!isRemoteBackupListingServer(serverId)) {
		return;
	}

	await checkPermission(ctx, { server: ["execute"] });
	await checkPermission(ctx, { backup: ["create"] });
};

const getBackupListingScopes = (allowedPrefixes: string[], search: string) => {
	const normalizedSearch = search.trim()
		? normalizeRelativeFilePath(search.trim())
		: "";
	const lastSlashIndex = normalizedSearch.lastIndexOf("/");
	const requestedBaseDir =
		lastSlashIndex !== -1 ? normalizedSearch.slice(0, lastSlashIndex + 1) : "";
	const searchTerm =
		lastSlashIndex !== -1
			? normalizedSearch.slice(lastSlashIndex + 1)
			: normalizedSearch;

	const scopes = allowedPrefixes
		.map((prefix) => {
			if (!normalizedSearch?.includes("/")) {
				return { baseDir: prefix, searchTerm: normalizedSearch };
			}
			if (normalizedSearch.startsWith(prefix)) {
				return {
					baseDir:
						requestedBaseDir.length >= prefix.length
							? requestedBaseDir
							: prefix,
					searchTerm,
				};
			}
			if (prefix.startsWith(normalizedSearch)) {
				return { baseDir: prefix, searchTerm: "" };
			}
			return null;
		})
		.filter((scope): scope is { baseDir: string; searchTerm: string } =>
			Boolean(scope),
		);

	if (scopes.length === 0) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message:
				"Backup file path is not linked to an accessible backup schedule.",
		});
	}

	return scopes;
};

export const backupRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateBackup)
		.mutation(async ({ input, ctx }) => {
			try {
				const serviceId = assertBoundBackupService(
					toBoundBackupServiceInput({
						...input,
						backupType: input.backupType ?? "database",
					}),
				);
				if (serviceId) {
					await checkServicePermissionAndAccess(ctx, serviceId, {
						backup: ["create"],
					});
				} else if (
					input.backupType === "database" &&
					input.databaseType === "web-server"
				) {
					assertOwnerOrAdmin(
						ctx,
						"You don't have access to create server backups.",
					);
				} else {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Backup must be linked to a service.",
					});
				}
				await assertDestinationAccess(
					input.destinationId,
					ctx.session.activeOrganizationId,
				);

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
					} else if (databaseType === "libsql" && backup.libsql?.serverId) {
						serverId = backup.libsql.serverId;
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
				await audit(ctx, {
					action: "create",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
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
	one: protectedProcedure
		.input(apiFindOneBackup)
		.query(async ({ input, ctx }) => {
			const backup = await findBackupById(input.backupId);
			await assertBackupAccess(ctx, backup, "read");

			return redactBackupScheduleSecrets(backup);
		}),
	update: protectedProcedure
		.input(apiUpdateBackup)
		.mutation(async ({ input, ctx }) => {
			try {
				const existing = await findBackupById(input.backupId);
				await assertBackupAccess(ctx, existing, "update");
				if (input.databaseType !== existing.databaseType) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Backup database type cannot be changed.",
					});
				}
				await assertDestinationAccess(
					input.destinationId,
					ctx.session.activeOrganizationId,
				);
				const signedRemovalJob =
					IS_CLOUD && existing.enabled
						? await signScheduledQueueJob(
								{
									cronSchedule: existing.schedule,
									backupId: existing.backupId,
									type: "backup",
								},
								{
									operation: "remove",
									requireEnabled: false,
									requireActiveServer: false,
								},
							)
						: null;

				const updateInput = {
					...input,
					metadata: preserveBackupMetadataSecrets(
						input.metadata,
						existing.metadata as BackupMetadataInput,
					),
				};
				await updateBackupById(input.backupId, updateInput);
				const backup = await findBackupById(input.backupId);

				if (IS_CLOUD) {
					if (backup.enabled) {
						await updateJob({
							cronSchedule: backup.schedule,
							backupId: backup.backupId,
							type: "backup",
						});
					} else if (signedRemovalJob) {
						await removeSignedJob(signedRemovalJob);
					}
				} else {
					if (backup.enabled) {
						removeScheduleBackup(input.backupId);
						scheduleBackup(backup);
					} else {
						removeScheduleBackup(input.backupId);
					}
				}
				await audit(ctx, {
					action: "update",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
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
		.mutation(async ({ input, ctx }) => {
			try {
				const backup = await findBackupById(input.backupId);
				await assertBackupAccess(ctx, backup, "delete");

				if (IS_CLOUD) {
					await removeJob({
						backupId: input.backupId,
						cronSchedule: backup.schedule,
						type: "backup",
					});
				} else {
					removeScheduleBackup(input.backupId);
				}
				const value = await removeBackupById(input.backupId);
				await audit(ctx, {
					action: "delete",
					resourceType: "backup",
					resourceId: input.backupId,
				});
				return redactBackupScheduleSecrets(value);
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
		.mutation(async ({ input, ctx }) => {
			try {
				const backup = await findBackupById(input.backupId);
				if (!backup.postgresId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Backup is not linked to a Postgres service.",
					});
				}
				await checkServicePermissionAndAccess(ctx, backup.postgresId, {
					backup: ["create"],
				});
				const postgres = await findPostgresByBackupId(backup.backupId);
				await runPostgresBackup(postgres, backup);
				await keepLatestNBackups(backup, postgres?.serverId);
				await audit(ctx, {
					action: "run",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
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
		.mutation(async ({ input, ctx }) => {
			try {
				const backup = await findBackupById(input.backupId);
				if (!backup.mysqlId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Backup is not linked to a MySQL service.",
					});
				}
				await checkServicePermissionAndAccess(ctx, backup.mysqlId, {
					backup: ["create"],
				});
				const mysql = await findMySqlByBackupId(backup.backupId);
				await runMySqlBackup(mysql, backup);
				await keepLatestNBackups(backup, mysql?.serverId);
				await audit(ctx, {
					action: "run",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
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
		.mutation(async ({ input, ctx }) => {
			try {
				const backup = await findBackupById(input.backupId);
				if (!backup.mariadbId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Backup is not linked to a MariaDB service.",
					});
				}
				await checkServicePermissionAndAccess(ctx, backup.mariadbId, {
					backup: ["create"],
				});
				const mariadb = await findMariadbByBackupId(backup.backupId);
				await runMariadbBackup(mariadb, backup);
				await keepLatestNBackups(backup, mariadb?.serverId);
				await audit(ctx, {
					action: "run",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
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
		.mutation(async ({ input, ctx }) => {
			try {
				const backup = await findBackupById(input.backupId);
				if (!backup.composeId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Backup is not linked to a Compose service.",
					});
				}
				await checkServicePermissionAndAccess(ctx, backup.composeId, {
					backup: ["create"],
				});
				const compose = await findComposeByBackupId(backup.backupId);
				await runComposeBackup(compose, backup);
				await keepLatestNBackups(backup, compose?.serverId);
				await audit(ctx, {
					action: "run",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
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
		.mutation(async ({ input, ctx }) => {
			try {
				const backup = await findBackupById(input.backupId);
				if (!backup.mongoId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Backup is not linked to a Mongo service.",
					});
				}
				await checkServicePermissionAndAccess(ctx, backup.mongoId, {
					backup: ["create"],
				});
				const mongo = await findMongoByBackupId(backup.backupId);
				await runMongoBackup(mongo, backup);
				await keepLatestNBackups(backup, mongo?.serverId);
				await audit(ctx, {
					action: "run",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error running manual Mongo backup ",
					cause: error,
				});
			}
		}),
	manualBackupLibsql: protectedProcedure
		.input(apiFindOneBackup)
		.mutation(async ({ input, ctx }) => {
			try {
				const backup = await findBackupById(input.backupId);
				if (!backup.libsqlId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Backup is not linked to a LibSQL service.",
					});
				}
				await checkServicePermissionAndAccess(ctx, backup.libsqlId, {
					backup: ["create"],
				});
				const libsql = await findLibsqlByBackupId(backup.backupId);
				await runLibsqlBackup(libsql, backup);
				await keepLatestNBackups(backup, libsql?.serverId);
				await audit(ctx, {
					action: "run",
					resourceType: "backup",
					resourceId: backup.backupId,
				});
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error running manual Libsql backup ",
					cause: error,
				});
			}
		}),
	manualBackupWebServer: withPermission("backup", "create")
		.input(apiFindOneBackup)
		.mutation(async ({ input, ctx }) => {
			const backup = await findBackupById(input.backupId);
			await assertWebServerBackupAccess(ctx, backup, "create");
			await runWebServerBackup(backup);
			await keepLatestNBackups(backup);
			await audit(ctx, {
				action: "run",
				resourceType: "backup",
				resourceId: backup.backupId,
			});
			return true;
		}),
	listBackupFiles: withPermission("backup", "read")
		.input(
			z.object({
				destinationId: z.string(),
				search: z.string(),
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertBackupListingServerAccess(ctx, input.serverId);

			const destination = await assertRcloneS3DestinationAllowed(
				await assertDestinationAccess(
					input.destinationId,
					ctx.session.activeOrganizationId,
				),
			);
			try {
				const allowedPrefixes = await getAccessibleBackupListingPrefixes(
					ctx,
					input.destinationId,
				);
				if (allowedPrefixes.length === 0) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message:
							"No accessible backup schedules were found for this destination.",
					});
				}

				const scopes = getBackupListingScopes(allowedPrefixes, input.search);
				const results: RcloneFile[] = [];

				for (const scope of scopes) {
					const listCommand = `${buildRcloneS3Command("lsjson", destination, [
						getRcloneS3Destination(destination, scope.baseDir),
						"--no-mimetype",
						"--no-modtime",
					])} 2>/dev/null`;

					let stdout = "";

					if (isRemoteBackupListingServer(input.serverId)) {
						const result = await execAsyncRemote(
							input.serverId ?? null,
							listCommand,
						);
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

					results.push(
						...files.map((file) => ({
							...file,
							Path: `${scope.baseDir}${file.Path}`,
						})),
					);

					if (results.length >= 100) {
						break;
					}
				}

				const searchTerm = scopes[0]?.searchTerm;
				if (!searchTerm) {
					return results.slice(0, 100);
				}

				return results
					.filter((file) =>
						file.Path.toLowerCase().includes(searchTerm.toLowerCase()),
					)
					.slice(0, 100);
			} catch (error) {
				console.error("Error in listBackupFiles:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
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

	restoreBackupWithLogs: withPermission("backup", "restore")
		.meta({
			openapi: {
				enabled: false,
				path: "/restore-backup-with-logs",
				method: "POST",
				override: true,
			},
		})
		.input(apiRestoreBackup)
		.subscription(async function* ({ input, ctx, signal }) {
			const destination = await assertDestinationAccess(
				input.destinationId,
				ctx.session.activeOrganizationId,
			);

			const isWebServerRestore =
				input.backupType === "database" && input.databaseType === "web-server";
			const databaseId = input.databaseId.trim();

			if (isWebServerRestore) {
				assertOwnerOrAdmin(
					ctx,
					"You don't have access to restore server backups.",
				);
			} else {
				if (!databaseId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Database id is required for restore.",
					});
				}
				await checkServicePermissionAndAccess(ctx, databaseId, {
					backup: ["restore"],
				});
			}
			await assertRestoreBackupObjectBound(input, databaseId);
			const queue: string[] = [];
			let done = false;
			const onLog = (log: string) => queue.push(log);
			const runRestore = async () => {
				if (input.backupType === "database") {
					if (input.databaseType === "postgres") {
						const postgres = await findPostgresById(databaseId);
						await restorePostgresBackup(postgres, destination, input, onLog);
					} else if (input.databaseType === "mysql") {
						const mysql = await findMySqlById(databaseId);
						await restoreMySqlBackup(mysql, destination, input, onLog);
					} else if (input.databaseType === "mariadb") {
						const mariadb = await findMariadbById(databaseId);
						await restoreMariadbBackup(mariadb, destination, input, onLog);
					} else if (input.databaseType === "mongo") {
						const mongo = await findMongoById(databaseId);
						await restoreMongoBackup(mongo, destination, input, onLog);
					} else if (input.databaseType === "libsql") {
						const libsql = await findLibsqlById(databaseId);
						await restoreLibsqlBackup(libsql, destination, input, onLog);
					} else if (input.databaseType === "web-server") {
						await restoreWebServerBackup(destination, input.backupFile, onLog);
					}
				} else if (input.backupType === "compose") {
					const compose = await findComposeById(databaseId);
					await restoreComposeBackup(compose, destination, input, onLog);
				}
			};
			runRestore()
				.catch((error) => {
					onLog(
						`Error: ${error instanceof Error ? error.message : String(error)}`,
					);
				})
				.finally(() => {
					done = true;
				});
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

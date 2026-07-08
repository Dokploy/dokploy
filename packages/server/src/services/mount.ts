import { promises as fs } from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateMount,
	applications,
	compose,
	libsql,
	mariadb,
	mongo,
	mounts,
	mysql,
	postgres,
	redis,
	type ServiceType,
} from "@dokploy/server/db/schema";
import {
	createFile,
	getCreateFileCommand,
} from "@dokploy/server/utils/docker/utils";
import {
	type BindMountServiceContext,
	normalizeBindMountHostPath,
} from "@dokploy/server/utils/filesystem/bind-mount-path";
import {
	assertNoSymlinkEscapeInsideDirectory,
	normalizeRelativeFilePath,
	quoteShellArg,
} from "@dokploy/server/utils/filesystem/safe-path";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq, type SQL, sql } from "drizzle-orm";
import type { z } from "zod";

export type Mount = typeof mounts.$inferSelect;

const normalizeMountFilePath = (filePath: string | null | undefined) => {
	if (!filePath) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "File path is required",
		});
	}

	try {
		return normalizeRelativeFilePath(filePath);
	} catch {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid file path",
		});
	}
};

const normalizeMountInput = <T extends Partial<Mount>>(input: T) => {
	if (input.type === "file" || input.filePath) {
		return {
			...input,
			filePath: normalizeMountFilePath(input.filePath),
		};
	}

	return input;
};

const stripMountUpdateOwnershipFields = (mountData: Partial<Mount>) => {
	const safeMountData = { ...mountData };

	delete safeMountData.applicationId;
	delete safeMountData.composeId;
	delete safeMountData.libsqlId;
	delete safeMountData.mariadbId;
	delete safeMountData.mongoId;
	delete safeMountData.mountId;
	delete safeMountData.mysqlId;
	delete safeMountData.postgresId;
	delete safeMountData.redisId;
	delete safeMountData.serviceType;

	return safeMountData;
};

const findBindMountServiceContext = async (
	serviceType: ServiceType,
	serviceId: string,
): Promise<BindMountServiceContext> => {
	const columns = {
		appName: true,
		serverId: true,
	} as const;
	let service: { appName: string; serverId: string | null } | undefined | null;

	switch (serviceType) {
		case "application":
			service = await db.query.applications.findFirst({
				where: eq(applications.applicationId, serviceId),
				columns,
			});
			break;
		case "compose":
			service = await db.query.compose.findFirst({
				where: eq(compose.composeId, serviceId),
				columns,
			});
			break;
		case "libsql":
			service = await db.query.libsql.findFirst({
				where: eq(libsql.libsqlId, serviceId),
				columns,
			});
			break;
		case "mariadb":
			service = await db.query.mariadb.findFirst({
				where: eq(mariadb.mariadbId, serviceId),
				columns,
			});
			break;
		case "mongo":
			service = await db.query.mongo.findFirst({
				where: eq(mongo.mongoId, serviceId),
				columns,
			});
			break;
		case "mysql":
			service = await db.query.mysql.findFirst({
				where: eq(mysql.mysqlId, serviceId),
				columns,
			});
			break;
		case "postgres":
			service = await db.query.postgres.findFirst({
				where: eq(postgres.postgresId, serviceId),
				columns,
			});
			break;
		case "redis":
			service = await db.query.redis.findFirst({
				where: eq(redis.redisId, serviceId),
				columns,
			});
			break;
		default:
			serviceType satisfies never;
	}

	if (!service) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Service not found",
		});
	}

	return {
		appName: service.appName,
		serverId: service.serverId,
		serviceType,
	};
};

const getBindMountServiceContextFromMount = (
	mount: MountNested,
): BindMountServiceContext => {
	if (mount.serviceType === "application" && mount.application) {
		return {
			appName: mount.application.appName,
			serverId: mount.application.serverId,
			serviceType: mount.serviceType,
		};
	}
	if (mount.serviceType === "postgres" && mount.postgres) {
		return {
			appName: mount.postgres.appName,
			serverId: mount.postgres.serverId,
			serviceType: mount.serviceType,
		};
	}
	if (mount.serviceType === "mariadb" && mount.mariadb) {
		return {
			appName: mount.mariadb.appName,
			serverId: mount.mariadb.serverId,
			serviceType: mount.serviceType,
		};
	}
	if (mount.serviceType === "mongo" && mount.mongo) {
		return {
			appName: mount.mongo.appName,
			serverId: mount.mongo.serverId,
			serviceType: mount.serviceType,
		};
	}
	if (mount.serviceType === "mysql" && mount.mysql) {
		return {
			appName: mount.mysql.appName,
			serverId: mount.mysql.serverId,
			serviceType: mount.serviceType,
		};
	}
	if (mount.serviceType === "redis" && mount.redis) {
		return {
			appName: mount.redis.appName,
			serverId: mount.redis.serverId,
			serviceType: mount.serviceType,
		};
	}
	if (mount.serviceType === "compose" && mount.compose) {
		return {
			appName: mount.compose.appName,
			serverId: mount.compose.serverId,
			serviceType: mount.serviceType,
		};
	}
	if (mount.serviceType === "libsql" && mount.libsql) {
		return {
			appName: mount.libsql.appName,
			serverId: mount.libsql.serverId,
			serviceType: mount.serviceType,
		};
	}

	throw new TRPCError({
		code: "BAD_REQUEST",
		message: "Mount service not found",
	});
};

const normalizeCreateMountInput = async (
	input: z.infer<typeof apiCreateMount>,
) => {
	const normalizedInput = normalizeMountInput(input);
	if (normalizedInput.type !== "bind") {
		return normalizedInput;
	}

	if (!normalizedInput.serviceType || !normalizedInput.serviceId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Service is required for bind mounts",
		});
	}

	const serviceContext = await findBindMountServiceContext(
		normalizedInput.serviceType,
		normalizedInput.serviceId,
	);

	return {
		...normalizedInput,
		hostPath: normalizeBindMountHostPath(
			normalizedInput.hostPath,
			serviceContext,
		),
	};
};

const normalizeUpdateMountInput = async (
	mountId: string,
	mountData: Partial<Mount>,
) => {
	const existingMount = await findMountById(mountId);
	const normalizedMountData = normalizeMountInput(
		stripMountUpdateOwnershipFields(mountData),
	);
	const nextType = normalizedMountData.type ?? existingMount.type;

	if (nextType !== "bind") {
		return normalizedMountData;
	}

	return {
		...normalizedMountData,
		hostPath: normalizeBindMountHostPath(
			normalizedMountData.hostPath ?? existingMount.hostPath,
			getBindMountServiceContextFromMount(existingMount),
		),
	};
};

export const createMount = async (input: z.infer<typeof apiCreateMount>) => {
	try {
		const normalizedInput = await normalizeCreateMountInput(input);
		const { serviceId, ...rest } = normalizedInput;
		const value = await db
			.insert(mounts)
			.values({
				...rest,
				...(normalizedInput.serviceType === "application" && {
					applicationId: serviceId,
				}),
				...(normalizedInput.serviceType === "compose" && {
					composeId: serviceId,
				}),
				...(normalizedInput.serviceType === "libsql" && {
					libsqlId: serviceId,
				}),
				...(normalizedInput.serviceType === "mariadb" && {
					mariadbId: serviceId,
				}),
				...(normalizedInput.serviceType === "mongo" && {
					mongoId: serviceId,
				}),
				...(normalizedInput.serviceType === "mysql" && {
					mysqlId: serviceId,
				}),
				...(normalizedInput.serviceType === "postgres" && {
					postgresId: serviceId,
				}),
				...(normalizedInput.serviceType === "redis" && {
					redisId: serviceId,
				}),
			})
			.returning()
			.then((value) => value[0]);

		if (!value) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error inserting mount",
			});
		}

		if (value.type === "file") {
			await createFileMount(value.mountId);
		}
		return value;
	} catch (error) {
		console.log(error);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Error ${error instanceof Error ? error.message : error}`,
			cause: error,
		});
	}
};

export const createFileMount = async (mountId: string) => {
	try {
		const mount = await findMountById(mountId);
		const baseFilePath = await getBaseFilesPath(mountId);

		const serverId = await getServerId(mount);

		if (serverId) {
			const command = getCreateFileCommand(
				baseFilePath,
				mount.filePath || "",
				mount.content || "",
			);
			await execAsyncRemote(serverId, command);
		} else {
			await createFile(baseFilePath, mount.filePath || "", mount.content || "");
		}
	} catch (error) {
		console.log(`Error creating the file mount: ${error}`);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Error creating the mount ${error instanceof Error ? error.message : error}`,
			cause: error,
		});
	}
};

export const findMountById = async (mountId: string) => {
	const mount = await db.query.mounts.findFirst({
		where: eq(mounts.mountId, mountId),
		with: {
			application: {
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
			mysql: {
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
			redis: {
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			},
		},
	});
	if (!mount) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Mount not found",
		});
	}
	return mount;
};

export const findMountOrganizationId = async (mountId: string) => {
	const mount = await findMountById(mountId);

	if (mount.application) {
		return mount.application.environment.project.organizationId;
	}
	if (mount.compose) {
		return mount.compose.environment.project.organizationId;
	}
	if (mount.libsql) {
		return mount.libsql.environment.project.organizationId;
	}
	if (mount.mariadb) {
		return mount.mariadb.environment.project.organizationId;
	}
	if (mount.mongo) {
		return mount.mongo.environment.project.organizationId;
	}
	if (mount.mysql) {
		return mount.mysql.environment.project.organizationId;
	}
	if (mount.postgres) {
		return mount.postgres.environment.project.organizationId;
	}
	if (mount.redis) {
		return mount.redis.environment.project.organizationId;
	}

	return null;
};

export const updateMount = async (
	mountId: string,
	mountData: Partial<Mount>,
) => {
	const normalizedMountData = await normalizeUpdateMountInput(
		mountId,
		mountData,
	);
	const mount = await db.transaction(async (tx) => {
		const mount = await tx
			.update(mounts)
			.set({
				...normalizedMountData,
			})
			.where(eq(mounts.mountId, mountId))
			.returning()
			.then((value) => value[0]);

		if (!mount) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Mount not found",
			});
		}

		return await findMountById(mountId);
	});

	if (mount.type === "file") {
		await updateFileMount(mountId);
	}
	return mount;
};

export const findMountsByApplicationId = async (
	serviceId: string,
	serviceType: ServiceType,
) => {
	const sqlChunks: SQL[] = [];

	switch (serviceType) {
		case "application":
			sqlChunks.push(eq(mounts.applicationId, serviceId));
			break;
		case "libsql":
			sqlChunks.push(eq(mounts.libsqlId, serviceId));
			break;
		case "mariadb":
			sqlChunks.push(eq(mounts.mariadbId, serviceId));
			break;
		case "mongo":
			sqlChunks.push(eq(mounts.mongoId, serviceId));
			break;
		case "mysql":
			sqlChunks.push(eq(mounts.mysqlId, serviceId));
			break;
		case "postgres":
			sqlChunks.push(eq(mounts.postgresId, serviceId));
			break;
		case "redis":
			sqlChunks.push(eq(mounts.redisId, serviceId));
			break;
		case "compose":
			sqlChunks.push(eq(mounts.composeId, serviceId));
			break;
		default:
			throw new Error(`Unknown service type: ${serviceType}`);
	}
	const mount = await db.query.mounts.findMany({
		where: sql.join(sqlChunks, sql.raw(" ")),
	});

	return mount;
};

export const deleteMount = async (mountId: string) => {
	const { type } = await findMountById(mountId);

	if (type === "file") {
		await deleteFileMount(mountId);
	}

	const deletedMount = await db
		.delete(mounts)
		.where(eq(mounts.mountId, mountId))
		.returning();
	return deletedMount[0];
};

export const updateFileMount = async (mountId: string) => {
	const mount = await findMountById(mountId);
	if (!mount.filePath) return;
	const basePath = await getBaseFilesPath(mountId);

	try {
		const serverId = await getServerId(mount);
		if (serverId) {
			const command = getCreateFileCommand(
				basePath,
				mount.filePath,
				mount.content || "",
			);
			await execAsyncRemote(serverId, command);
		} else {
			await createFile(basePath, mount.filePath, mount.content || "");
		}
	} catch {
		console.log("Error updating file mount");
	}
};

export const deleteFileMount = async (mountId: string) => {
	const mount = await findMountById(mountId);
	if (!mount.filePath) return;
	const basePath = await getBaseFilesPath(mountId);

	const { fullPath } = assertNoSymlinkEscapeInsideDirectory(
		basePath,
		mount.filePath,
	);
	try {
		const serverId = await getServerId(mount);
		if (serverId) {
			const command = `rm -rf -- ${quoteShellArg(fullPath)}`;
			await execAsyncRemote(serverId, command);
		} else {
			await fs.rm(fullPath, { force: true, recursive: true });
		}
	} catch {}
};

export const getBaseFilesPath = async (mountId: string) => {
	const mount = await findMountById(mountId);

	let absoluteBasePath = "";
	let appName = "";
	let directoryPath = "";

	if (mount.serviceType === "application" && mount.application) {
		const { APPLICATIONS_PATH } = paths(!!mount.application.serverId);
		absoluteBasePath = path.resolve(APPLICATIONS_PATH);
		appName = mount.application.appName;
	} else if (mount.serviceType === "postgres" && mount.postgres) {
		const { APPLICATIONS_PATH } = paths(!!mount.postgres.serverId);
		absoluteBasePath = path.resolve(APPLICATIONS_PATH);
		appName = mount.postgres.appName;
	} else if (mount.serviceType === "mariadb" && mount.mariadb) {
		const { APPLICATIONS_PATH } = paths(!!mount.mariadb.serverId);
		absoluteBasePath = path.resolve(APPLICATIONS_PATH);
		appName = mount.mariadb.appName;
	} else if (mount.serviceType === "mongo" && mount.mongo) {
		const { APPLICATIONS_PATH } = paths(!!mount.mongo.serverId);
		absoluteBasePath = path.resolve(APPLICATIONS_PATH);
		appName = mount.mongo.appName;
	} else if (mount.serviceType === "mysql" && mount.mysql) {
		const { APPLICATIONS_PATH } = paths(!!mount.mysql.serverId);
		absoluteBasePath = path.resolve(APPLICATIONS_PATH);
		appName = mount.mysql.appName;
	} else if (mount.serviceType === "redis" && mount.redis) {
		const { APPLICATIONS_PATH } = paths(!!mount.redis.serverId);
		absoluteBasePath = path.resolve(APPLICATIONS_PATH);
		appName = mount.redis.appName;
	} else if (mount.serviceType === "compose" && mount.compose) {
		const { COMPOSE_PATH } = paths(!!mount.compose.serverId);
		appName = mount.compose.appName;
		absoluteBasePath = path.resolve(COMPOSE_PATH);
	} else if (mount.serviceType === "libsql" && mount.libsql) {
		const { APPLICATIONS_PATH } = paths(!!mount.libsql.serverId);
		absoluteBasePath = path.resolve(APPLICATIONS_PATH);
		appName = mount.libsql.appName;
	}
	directoryPath = path.join(absoluteBasePath, appName, "files");

	return directoryPath;
};

type MountNested = Awaited<ReturnType<typeof findMountById>>;
export const getServerId = async (mount: MountNested) => {
	if (mount.serviceType === "application" && mount?.application?.serverId) {
		return mount.application.serverId;
	}
	if (mount.serviceType === "postgres" && mount?.postgres?.serverId) {
		return mount.postgres.serverId;
	}
	if (mount.serviceType === "mariadb" && mount?.mariadb?.serverId) {
		return mount.mariadb.serverId;
	}
	if (mount.serviceType === "mongo" && mount?.mongo?.serverId) {
		return mount.mongo.serverId;
	}
	if (mount.serviceType === "mysql" && mount?.mysql?.serverId) {
		return mount.mysql.serverId;
	}
	if (mount.serviceType === "redis" && mount?.redis?.serverId) {
		return mount.redis.serverId;
	}
	if (mount.serviceType === "compose" && mount?.compose?.serverId) {
		return mount.compose.serverId;
	}
	if (mount.serviceType === "libsql" && mount?.libsql?.serverId) {
		return mount.libsql.serverId;
	}

	return null;
};

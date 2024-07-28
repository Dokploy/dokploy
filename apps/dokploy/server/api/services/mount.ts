import { rmdir, stat, unlink } from "node:fs/promises";
import path, { join } from "node:path";
import { APPLICATIONS_PATH, COMPOSE_PATH } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type ServiceType,
	type apiCreateMount,
	mounts,
} from "@dokploy/server/db/schema";
import { createFile } from "@dokploy/server/utils/docker/utils";
import { removeFileOrDirectory } from "@dokploy/server/utils/filesystem/directory";
import { TRPCError } from "@trpc/server";
import { type SQL, eq, sql } from "drizzle-orm";

export type Mount = typeof mounts.$inferSelect;

export const createMount = async (input: typeof apiCreateMount._type) => {
	try {
		const { serviceId, ...rest } = input;
		const value = await db
			.insert(mounts)
			.values({
				...rest,
				...(input.serviceType === "application" && {
					applicationId: serviceId,
				}),
				...(input.serviceType === "postgres" && {
					postgresId: serviceId,
				}),
				...(input.serviceType === "mariadb" && {
					mariadbId: serviceId,
				}),
				...(input.serviceType === "mongo" && {
					mongoId: serviceId,
				}),
				...(input.serviceType === "mysql" && {
					mysqlId: serviceId,
				}),
				...(input.serviceType === "redis" && {
					redisId: serviceId,
				}),
				...(input.serviceType === "compose" && {
					composeId: serviceId,
				}),
			})
			.returning()
			.then((value) => value[0]);

		if (!value) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting mount",
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
			message: "Error to create the mount",
			cause: error,
		});
	}
};

export const createFileMount = async (mountId: string) => {
	try {
		const mount = await findMountById(mountId);
		const baseFilePath = await getBaseFilesPath(mountId);
		await createFile(baseFilePath, mount.filePath || "", mount.content || "");
	} catch (error) {
		console.log(`Error to create the file mount: ${error}`);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to create the mount",
			cause: error,
		});
	}
};

export const findMountById = async (mountId: string) => {
	const mount = await db.query.mounts.findFirst({
		where: eq(mounts.mountId, mountId),
		with: {
			application: true,
			postgres: true,
			mariadb: true,
			mongo: true,
			mysql: true,
			redis: true,
			compose: true,
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

export const updateMount = async (
	mountId: string,
	mountData: Partial<Mount>,
) => {
	return await db.transaction(async (transaction) => {
		const mount = await db
			.update(mounts)
			.set({
				...mountData,
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

		if (mount.type === "file") {
			await deleteFileMount(mountId);
			await createFileMount(mountId);
		}
		return mount;
	});
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
		case "postgres":
			sqlChunks.push(eq(mounts.postgresId, serviceId));
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
		case "redis":
			sqlChunks.push(eq(mounts.redisId, serviceId));
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

export const deleteFileMount = async (mountId: string) => {
	const mount = await findMountById(mountId);
	if (!mount.filePath) return;
	const basePath = await getBaseFilesPath(mountId);
	const fullPath = path.join(basePath, mount.filePath);
	try {
		await removeFileOrDirectory(fullPath);
	} catch (error) {}
};

export const getBaseFilesPath = async (mountId: string) => {
	const mount = await findMountById(mountId);

	let absoluteBasePath = path.resolve(APPLICATIONS_PATH);
	let appName = "";
	let directoryPath = "";

	if (mount.serviceType === "application" && mount.application) {
		appName = mount.application.appName;
	} else if (mount.serviceType === "postgres" && mount.postgres) {
		appName = mount.postgres.appName;
	} else if (mount.serviceType === "mariadb" && mount.mariadb) {
		appName = mount.mariadb.appName;
	} else if (mount.serviceType === "mongo" && mount.mongo) {
		appName = mount.mongo.appName;
	} else if (mount.serviceType === "mysql" && mount.mysql) {
		appName = mount.mysql.appName;
	} else if (mount.serviceType === "redis" && mount.redis) {
		appName = mount.redis.appName;
	} else if (mount.serviceType === "compose" && mount.compose) {
		appName = mount.compose.appName;
		absoluteBasePath = path.resolve(COMPOSE_PATH);
	}
	directoryPath = path.join(absoluteBasePath, appName, "files");

	return directoryPath;
};

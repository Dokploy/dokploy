import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateMount,
	mounts,
	type ServiceType,
} from "@dokploy/server/db/schema";
import {
	createFile,
	encodeBase64,
	getCreateFileCommand,
} from "@dokploy/server/utils/docker/utils";
import { removeFileOrDirectory } from "@dokploy/server/utils/filesystem/directory";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq, type SQL, sql } from "drizzle-orm";

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
	const mount = await db.transaction(async (tx) => {
		const mount = await tx
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

export const updateFileMount = async (mountId: string) => {
	const mount = await findMountById(mountId);
	if (!mount || !mount.filePath) return;
	const basePath = await getBaseFilesPath(mountId);
	const fullPath = path.join(basePath, mount.filePath);

	try {
		const serverId = await getServerId(mount);
		const encodedContent = encodeBase64(mount.content || "");
		const command = `echo "${encodedContent}" | base64 -d > ${fullPath}`;
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
	} catch {
		console.log("Error updating file mount");
	}
};

export const deleteFileMount = async (mountId: string) => {
	const mount = await findMountById(mountId);
	if (!mount.filePath) return;
	const basePath = await getBaseFilesPath(mountId);

	const fullPath = path.join(basePath, mount.filePath);
	try {
		const serverId = await getServerId(mount);
		if (serverId) {
			const command = `rm -rf ${fullPath}`;
			await execAsyncRemote(serverId, command);
		} else {
			await removeFileOrDirectory(fullPath);
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

	return null;
};

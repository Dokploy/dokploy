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
	getCreateFileCommand,
} from "@dokploy/server/utils/docker/utils";
import { removeFileOrDirectory } from "@dokploy/server/utils/filesystem/directory";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq, type SQL, sql } from "drizzle-orm";
import { quote } from "shell-quote";
import type { z } from "zod";

export type Mount = typeof mounts.$inferSelect;

export const createMount = async (input: z.infer<typeof apiCreateMount>) => {
	try {
		const { serviceId, ...rest } = input;
		const value = await db
			.insert(mounts)
			.values({
				...rest,
				...(input.serviceType === "application" && {
					applicationId: serviceId,
				}),
				...(input.serviceType === "compose" && {
					composeId: serviceId,
				}),
				...(input.serviceType === "libsql" && {
					libsqlId: serviceId,
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
				...(input.serviceType === "postgres" && {
					postgresId: serviceId,
				}),
				...(input.serviceType === "redis" && {
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
	const serviceWith = {
		columns: { serverId: true, appName: true },
		with: {
			environment: {
				columns: {},
				with: {
					project: { columns: { organizationId: true } },
				},
			},
		},
	} as const;

	const mount = await db.query.mounts.findFirst({
		where: eq(mounts.mountId, mountId),
		with: {
			application: serviceWith,
			compose: serviceWith,
			libsql: serviceWith,
			mariadb: serviceWith,
			mongo: serviceWith,
			mysql: serviceWith,
			postgres: serviceWith,
			redis: serviceWith,
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
	if (!mount || !mount.filePath) return;
	const basePath = await getBaseFilesPath(mountId);

	try {
		const serverId = await getServerId(mount);
		// Reuses the same mkdir-p + stale-directory-clearing logic as createFileMount,
		// so editing a mount whose path was previously created as an empty directory
		// (nested File Path, or a container's bind-mount fallback beating us to it)
		// self-heals instead of silently failing.
		const command = getCreateFileCommand(
			basePath,
			mount.filePath,
			mount.content || "",
		);
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
	} catch (error) {
		console.log("Error updating file mount", error);
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
			const command = `rm -rf ${quote([fullPath])}`;
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

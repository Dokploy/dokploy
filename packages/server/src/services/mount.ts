import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateMount,
	mounts,
	type ServiceType,
} from "@dokploy/server/db/schema";
import {
	assertNoSymlinkEscape,
	createFile,
	getCreateFileCommand,
	getSymlinkEscapeGuard,
	isValidMountFilePath,
} from "@dokploy/server/utils/docker/utils";
import { removeFileOrDirectory } from "@dokploy/server/utils/filesystem/directory";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";
import { TRPCError } from "@trpc/server";
import { and, eq, type SQL, sql } from "drizzle-orm";
import { quote } from "shell-quote";
import type { z } from "zod";
import { findApplicationById } from "./application";
import { findComposeById } from "./compose";
import { findLibsqlById } from "./libsql";
import { findMariadbById } from "./mariadb";
import { findMongoById } from "./mongo";
import { findMySqlById } from "./mysql";
import { findMemberByUserId } from "./permission";
import { findPostgresById } from "./postgres";
import { findRedisById } from "./redis";

export type Mount = typeof mounts.$inferSelect;

export const createMount = async (input: z.infer<typeof apiCreateMount>) => {
	try {
		// An empty filePath would write the content over the service's whole files/ directory
		if (input.type === "file" && !input.filePath?.trim()) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "File path is required for file mounts",
			});
		}
		// Checked before insert: deleting a saved row runs rm -rf on its path
		if (input.type === "file" && !isValidMountFilePath(input.filePath ?? "")) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Invalid file path: ${input.filePath}`,
			});
		}
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
	if (mountData.filePath && !isValidMountFilePath(mountData.filePath)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid file path: ${mountData.filePath}`,
		});
	}
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
		console.log(`Error updating the file mount: ${error}`);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Error updating the mount ${error instanceof Error ? error.message : error}`,
			cause: error,
		});
	}
};

export const readFileMountContent = async (mountId: string) => {
	const mount = await findMountById(mountId);
	if (mount.type !== "file" || !mount.filePath) return null;
	const basePath = await getBaseFilesPath(mountId);
	const fullPath = quote([path.join(basePath, mount.filePath)]);

	// Check the opened file's real path so symlinks can't escape the files dir.
	const command = `base=$(realpath ${quote([basePath])}) && [ -f ${fullPath} ] && { real=$(readlink /proc/self/fd/3 2>/dev/null || realpath ${fullPath}) && case "$real" in "$base"/*) content=$(base64 <&3) && printf 'found:%s' "$content" | tr -d '\\n';; esac; } 3< ${fullPath}; exit 0`;
	const serverId = await getServerId(mount);
	const { stdout } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);

	if (!stdout.startsWith("found:")) return null;
	return Buffer.from(stdout.slice("found:".length), "base64").toString("utf8");
};

export const deleteFileMount = async (mountId: string) => {
	const mount = await findMountById(mountId);
	if (!mount.filePath || !isValidMountFilePath(mount.filePath)) return;
	const basePath = await getBaseFilesPath(mountId);

	const fullPath = path.join(basePath, mount.filePath);
	try {
		const serverId = await getServerId(mount);
		if (serverId) {
			const command = `${getSymlinkEscapeGuard(basePath, fullPath)} rm -rf ${quote([fullPath])}`;
			await execAsyncRemote(serverId, command);
		} else {
			assertNoSymlinkEscape(basePath, fullPath);
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

const BLOCKED_HOST_PATHS = [
	"/etc",
	"/root",
	"/proc",
	"/sys",
	"/dev",
	"/boot",
	"/run",
	"/var/run",
	"/var/lib/docker",
	"/usr",
	"/bin",
	"/sbin",
	"/lib",
	"/lib64",
];

const isWithin = (child: string, parent: string) =>
	child === parent || child.startsWith(`${parent}/`);

const isBlockedHostPath = (hostPath: string) => {
	const normalized = path.posix.normalize(hostPath).replace(/\/+$/, "") || "/";
	if (!normalized.startsWith("/") || normalized === "/") return true;
	// A parent of a blocked path (e.g. /var) exposes it just the same.
	return BLOCKED_HOST_PATHS.some(
		(blocked) => isWithin(normalized, blocked) || isWithin(blocked, normalized),
	);
};

export const assertCanUseBindMount = async (
	ctx: { user: { id: string }; session: { activeOrganizationId: string } },
	type: string | null | undefined,
	hostPath: string | null | undefined,
) => {
	if (type !== "bind" && !hostPath) return;
	const member = await findMemberByUserId(
		ctx.user.id,
		ctx.session.activeOrganizationId,
	);
	if (member.role === "owner" || member.role === "admin") return;
	if (!hostPath || isBlockedHostPath(hostPath)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message:
				"This host path is not allowed for bind mounts. Ask an owner or admin to add it.",
		});
	}
};

const SERVICE_FINDERS = {
	application: findApplicationById,
	compose: findComposeById,
	postgres: findPostgresById,
	mysql: findMySqlById,
	mariadb: findMariadbById,
	mongo: findMongoById,
	redis: findRedisById,
	libsql: findLibsqlById,
};

// Attaching a volume that already exists gives the service everything stored in it.
export const assertCanUseVolumeMount = async (
	ctx: { user: { id: string }; session: { activeOrganizationId: string } },
	input: {
		serviceId: string;
		serviceType: ServiceType;
		type?: string | null;
		volumeName?: string | null;
	},
) => {
	const { serviceId, serviceType, type, volumeName } = input;
	if (type !== "volume" || !volumeName) return;
	const member = await findMemberByUserId(
		ctx.user.id,
		ctx.session.activeOrganizationId,
	);
	if (member.role === "owner" || member.role === "admin") return;

	const attached = await db.query.mounts.findFirst({
		where: and(
			eq(mounts[`${serviceType}Id`], serviceId),
			eq(mounts.type, "volume"),
			eq(mounts.volumeName, volumeName),
		),
	});
	if (attached) return;

	const service = await SERVICE_FINDERS[serviceType](serviceId);
	const docker = await getRemoteDocker(service.serverId);
	const exists = await docker
		.getVolume(volumeName)
		.inspect()
		.then(
			() => true,
			(error) => error?.statusCode !== 404,
		);
	if (exists) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message:
				"This volume already exists and is not attached to this service. Ask an owner or admin to attach it.",
		});
	}
};

export async function getServiceOrganizationId(
	serviceId: string,
	serviceType: ServiceType,
): Promise<string | null> {
	switch (serviceType) {
		case "application": {
			const app = await findApplicationById(serviceId);
			return app?.environment?.project?.organizationId ?? null;
		}
		case "postgres": {
			const postgres = await findPostgresById(serviceId);
			return postgres?.environment?.project?.organizationId ?? null;
		}
		case "mariadb": {
			const mariadb = await findMariadbById(serviceId);
			return mariadb?.environment?.project?.organizationId ?? null;
		}
		case "mongo": {
			const mongo = await findMongoById(serviceId);
			return mongo?.environment?.project?.organizationId ?? null;
		}
		case "mysql": {
			const mysql = await findMySqlById(serviceId);
			return mysql?.environment?.project?.organizationId ?? null;
		}
		case "redis": {
			const redis = await findRedisById(serviceId);
			return redis?.environment?.project?.organizationId ?? null;
		}
		case "compose": {
			const compose = await findComposeById(serviceId);
			return compose?.environment?.project?.organizationId ?? null;
		}
		case "libsql": {
			const libsql = await findLibsqlById(serviceId);
			return libsql?.environment?.project?.organizationId ?? null;
		}
		default:
			return null;
	}
}

import { unlink } from "node:fs/promises";
import path from "node:path";
import { APPLICATIONS_PATH } from "@/server/constants";
import { db } from "@/server/db";
import {
	type apiCreateMount,
	mounts,
	type ServiceType,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq, sql, type SQL } from "drizzle-orm";

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
	const mount = await db
		.update(mounts)
		.set({
			...mountData,
		})
		.where(eq(mounts.mountId, mountId))
		.returning();

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
	const {
		type,
		mountPath,
		serviceType,
		application,
		mariadb,
		mongo,
		mysql,
		postgres,
		redis,
	} = await findMountById(mountId);

	let appName = null;

	if (serviceType === "application") {
		appName = application?.appName;
	} else if (serviceType === "postgres") {
		appName = postgres?.appName;
	} else if (serviceType === "mariadb") {
		appName = mariadb?.appName;
	} else if (serviceType === "mongo") {
		appName = mongo?.appName;
	} else if (serviceType === "mysql") {
		appName = mysql?.appName;
	} else if (serviceType === "redis") {
		appName = redis?.appName;
	}

	if (type === "file" && appName) {
		const fileName = mountPath.split("/").pop() || "";
		const absoluteBasePath = path.resolve(APPLICATIONS_PATH);
		const filePath = path.join(absoluteBasePath, appName, "files", fileName);
		try {
			await unlink(filePath);
		} catch (error) {}
	}

	const deletedMount = await db
		.delete(mounts)
		.where(eq(mounts.mountId, mountId))
		.returning();
	return deletedMount[0];
};

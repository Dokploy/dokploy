import { db } from "@dokploy/server/db";
import {
	type apiCreateMongo,
	backups,
	buildAppName,
	compose,
	mongo,
} from "@dokploy/server/db/schema";
import { generatePassword } from "@dokploy/server/templates";
import { buildMongo } from "@dokploy/server/utils/databases/mongo";
import { pullImage } from "@dokploy/server/utils/docker/utils";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq, getTableColumns } from "drizzle-orm";
import { validUniqueServerAppName } from "./project";

export type Mongo = typeof mongo.$inferSelect;

export const createMongo = async (input: typeof apiCreateMongo._type) => {
	const appName = buildAppName("mongo", input.appName);

	const valid = await validUniqueServerAppName(appName);
	if (!valid) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Service with this 'AppName' already exists",
		});
	}

	const newMongo = await db
		.insert(mongo)
		.values({
			...input,
			databasePassword: input.databasePassword
				? input.databasePassword
				: generatePassword(),
			appName,
		})
		.returning()
		.then((value) => value[0]);

	if (!newMongo) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting mongo database",
		});
	}

	return newMongo;
};

export const findMongoById = async (mongoId: string) => {
	const result = await db.query.mongo.findFirst({
		where: eq(mongo.mongoId, mongoId),
		with: {
			project: true,
			mounts: true,
			server: true,
			backups: {
				with: {
					destination: true,
					deployments: true,
				},
			},
		},
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Mongo not found",
		});
	}
	return result;
};

export const updateMongoById = async (
	mongoId: string,
	mongoData: Partial<Mongo>,
) => {
	const { appName, ...rest } = mongoData;
	const result = await db
		.update(mongo)
		.set({
			...rest,
		})
		.where(eq(mongo.mongoId, mongoId))
		.returning();

	return result[0];
};

export const findMongoByBackupId = async (backupId: string) => {
	const result = await db
		.select({
			...getTableColumns(mongo),
		})
		.from(mongo)
		.innerJoin(backups, eq(mongo.mongoId, backups.mongoId))
		.where(eq(backups.backupId, backupId))
		.limit(1);

	if (!result || !result[0]) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Mongo not found",
		});
	}
	return result[0];
};

export const findComposeByBackupId = async (backupId: string) => {
	const result = await db
		.select({
			...getTableColumns(compose),
		})
		.from(compose)
		.innerJoin(backups, eq(compose.composeId, backups.composeId))
		.where(eq(backups.backupId, backupId))
		.limit(1);

	if (!result || !result[0]) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Compose not found",
		});
	}
	return result[0];
};

export const removeMongoById = async (mongoId: string) => {
	const result = await db
		.delete(mongo)
		.where(eq(mongo.mongoId, mongoId))
		.returning();

	return result[0];
};

export const deployMongo = async (
	mongoId: string,
	onData?: (data: any) => void,
) => {
	const mongo = await findMongoById(mongoId);
	try {
		await updateMongoById(mongoId, {
			applicationStatus: "running",
		});

		onData?.("Starting mongo deployment...");
		if (mongo.serverId) {
			await execAsyncRemote(
				mongo.serverId,
				`docker pull ${mongo.dockerImage}`,
				onData,
			);
		} else {
			await pullImage(mongo.dockerImage, onData);
		}

		await buildMongo(mongo);
		await updateMongoById(mongoId, {
			applicationStatus: "done",
		});
		onData?.("Deployment completed successfully!");
	} catch (error) {
		onData?.(`Error: ${error}`);
		await updateMongoById(mongoId, {
			applicationStatus: "error",
		});

		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Error on deploy mongo${error}`,
		});
	}
	return mongo;
};

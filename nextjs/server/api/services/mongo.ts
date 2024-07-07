import { generateRandomPassword } from "@/server/auth/random-password";
import { db } from "@/server/db";
import { type apiCreateMongo, backups, mongo } from "@/server/db/schema";
import { buildMongo } from "@/server/utils/databases/mongo";
import { pullImage } from "@/server/utils/docker/utils";
import { TRPCError } from "@trpc/server";
import { eq, getTableColumns } from "drizzle-orm";
import { validUniqueServerAppName } from "./project";
import { generateAppName } from "@/server/db/schema/utils";
import { generatePassword } from "@/templates/utils";

export type Mongo = typeof mongo.$inferSelect;

export const createMongo = async (input: typeof apiCreateMongo._type) => {
	input.appName =
		`${input.appName}-${generatePassword(6)}` || generateAppName("postgres");
	if (input.appName) {
		const valid = await validUniqueServerAppName(input.appName);

		if (!valid) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "Service with this 'AppName' already exists",
			});
		}
	}

	const newMongo = await db
		.insert(mongo)
		.values({
			...input,
			databasePassword: input.databasePassword
				? input.databasePassword
				: (await generateRandomPassword()).randomPassword,
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
			backups: {
				with: {
					destination: true,
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
	postgresData: Partial<Mongo>,
) => {
	const result = await db
		.update(mongo)
		.set({
			...postgresData,
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

export const removeMongoById = async (mongoId: string) => {
	const result = await db
		.delete(mongo)
		.where(eq(mongo.mongoId, mongoId))
		.returning();

	return result[0];
};

export const deployMongo = async (mongoId: string) => {
	const mongo = await findMongoById(mongoId);
	try {
		await pullImage(mongo.dockerImage);
		await buildMongo(mongo);
		await updateMongoById(mongoId, {
			applicationStatus: "done",
		});
	} catch (error) {
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

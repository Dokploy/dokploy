import { generateRandomPassword } from "@/server/auth/random-password";
import { db } from "@/server/db";
import { type apiCreateRedis, redis } from "@/server/db/schema";
import { buildRedis } from "@/server/utils/databases/redis";
import { pullImage } from "@/server/utils/docker/utils";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { validUniqueServerAppName } from "./project";
import { generateAppName } from "@/server/db/schema/utils";
import { generatePassword } from "@/templates/utils";

export type Redis = typeof redis.$inferSelect;

// https://github.com/drizzle-team/drizzle-orm/discussions/1483#discussioncomment-7523881
export const createRedis = async (input: typeof apiCreateRedis._type) => {
	input.appName =
		`${input.appName}-${generatePassword(6)}` || generateAppName("redis");
	if (input.appName) {
		const valid = await validUniqueServerAppName(input.appName);

		if (!valid) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "Service with this 'AppName' already exists",
			});
		}
	}

	const newRedis = await db
		.insert(redis)
		.values({
			...input,
			databasePassword: input.databasePassword
				? input.databasePassword
				: (await generateRandomPassword()).randomPassword,
		})
		.returning()
		.then((value) => value[0]);

	if (!newRedis) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting redis database",
		});
	}

	return newRedis;
};

export const findRedisById = async (redisId: string) => {
	const result = await db.query.redis.findFirst({
		where: eq(redis.redisId, redisId),
		with: {
			project: true,
			mounts: true,
		},
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Redis not found",
		});
	}
	return result;
};

export const updateRedisById = async (
	redisId: string,
	redisData: Partial<Redis>,
) => {
	const result = await db
		.update(redis)
		.set({
			...redisData,
		})
		.where(eq(redis.redisId, redisId))
		.returning();

	return result[0];
};

export const removeRedisById = async (redisId: string) => {
	const result = await db
		.delete(redis)
		.where(eq(redis.redisId, redisId))
		.returning();

	return result[0];
};

export const deployRedis = async (redisId: string) => {
	const redis = await findRedisById(redisId);
	try {
		await pullImage(redis.dockerImage);
		await buildRedis(redis);
		await updateRedisById(redisId, {
			applicationStatus: "done",
		});
	} catch (error) {
		await updateRedisById(redisId, {
			applicationStatus: "error",
		});

		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Error on deploy redis${error}`,
		});
	}
	return redis;
};

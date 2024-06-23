import { generateRandomPassword } from "@/server/auth/random-password";
import { db } from "@/server/db";
import { type apiCreateMySql, backups, mysql } from "@/server/db/schema";
import { buildMysql } from "@/server/utils/databases/mysql";
import { pullImage } from "@/server/utils/docker/utils";
import { TRPCError } from "@trpc/server";
import { eq, getTableColumns } from "drizzle-orm";
import { validUniqueServerAppName } from "./project";
import { generatePassword } from "@/templates/utils";
import { generateAppName } from "@/server/db/schema/utils";

export type MySql = typeof mysql.$inferSelect;

export const createMysql = async (input: typeof apiCreateMySql._type) => {
	input.appName =
		`${input.appName}-${generatePassword(6)}` || generateAppName("mysql");

	if (input.appName) {
		const valid = await validUniqueServerAppName(input.appName);

		if (!valid) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "Service with this 'AppName' already exists",
			});
		}
	}

	const newMysql = await db
		.insert(mysql)
		.values({
			...input,
			databasePassword: input.databasePassword
				? input.databasePassword
				: (await generateRandomPassword()).randomPassword,
			databaseRootPassword: input.databaseRootPassword
				? input.databaseRootPassword
				: (await generateRandomPassword()).randomPassword,
		})
		.returning()
		.then((value) => value[0]);

	if (!newMysql) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting mysql database",
		});
	}

	return newMysql;
};

// https://github.com/drizzle-team/drizzle-orm/discussions/1483#discussioncomment-7523881
export const findMySqlById = async (mysqlId: string) => {
	const result = await db.query.mysql.findFirst({
		where: eq(mysql.mysqlId, mysqlId),
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
			message: "MySql not found",
		});
	}
	return result;
};

export const updateMySqlById = async (
	mysqlId: string,
	mysqlData: Partial<MySql>,
) => {
	const result = await db
		.update(mysql)
		.set({
			...mysqlData,
		})
		.where(eq(mysql.mysqlId, mysqlId))
		.returning();

	return result[0];
};

export const findMySqlByBackupId = async (backupId: string) => {
	const result = await db
		.select({
			...getTableColumns(mysql),
		})
		.from(mysql)
		.innerJoin(backups, eq(mysql.mysqlId, backups.mysqlId))
		.where(eq(backups.backupId, backupId))
		.limit(1);

	if (!result || !result[0]) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Mysql not found",
		});
	}
	return result[0];
};

export const removeMySqlById = async (mysqlId: string) => {
	const result = await db
		.delete(mysql)
		.where(eq(mysql.mysqlId, mysqlId))
		.returning();

	return result[0];
};

export const deployMySql = async (mysqlId: string) => {
	const mysql = await findMySqlById(mysqlId);
	try {
		await pullImage(mysql.dockerImage);
		await buildMysql(mysql);
		await updateMySqlById(mysqlId, {
			applicationStatus: "done",
		});
	} catch (error) {
		await updateMySqlById(mysqlId, {
			applicationStatus: "error",
		});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Error on deploy mysql${error}`,
		});
	}
	return mysql;
};

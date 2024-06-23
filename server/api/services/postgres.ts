import { generateRandomPassword } from "@/server/auth/random-password";
import { db } from "@/server/db";
import { type apiCreatePostgres, backups, postgres } from "@/server/db/schema";
import { buildPostgres } from "@/server/utils/databases/postgres";
import { pullImage } from "@/server/utils/docker/utils";
import { TRPCError } from "@trpc/server";
import { eq, getTableColumns } from "drizzle-orm";
import { validUniqueServerAppName } from "./project";
import { generatePassword } from "@/templates/utils";
import { generateAppName } from "@/server/db/schema/utils";

export type Postgres = typeof postgres.$inferSelect;

export const createPostgres = async (input: typeof apiCreatePostgres._type) => {
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

	const newPostgres = await db
		.insert(postgres)
		.values({
			...input,
			databasePassword: input.databasePassword
				? input.databasePassword
				: (await generateRandomPassword()).randomPassword,
		})
		.returning()
		.then((value) => value[0]);

	if (!newPostgres) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting postgresql database",
		});
	}

	return newPostgres;
};

export const findPostgresById = async (postgresId: string) => {
	const result = await db.query.postgres.findFirst({
		where: eq(postgres.postgresId, postgresId),
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
			message: "Postgres not found",
		});
	}
	return result;
};

export const findPostgresByBackupId = async (backupId: string) => {
	const result = await db
		.select({
			...getTableColumns(postgres),
		})
		.from(postgres)
		.innerJoin(backups, eq(postgres.postgresId, backups.postgresId))
		.where(eq(backups.backupId, backupId))
		.limit(1);

	if (!result || !result[0]) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Postgres not found",
		});
	}
	return result[0];
};

export const updatePostgresById = async (
	postgresId: string,
	postgresData: Partial<Postgres>,
) => {
	const result = await db
		.update(postgres)
		.set({
			...postgresData,
		})
		.where(eq(postgres.postgresId, postgresId))
		.returning();

	return result[0];
};

export const removePostgresById = async (postgresId: string) => {
	const result = await db
		.delete(postgres)
		.where(eq(postgres.postgresId, postgresId))
		.returning();

	return result[0];
};

export const deployPostgres = async (postgresId: string) => {
	const postgres = await findPostgresById(postgresId);
	try {
		await pullImage(postgres.dockerImage);
		await buildPostgres(postgres);
		await updatePostgresById(postgresId, {
			applicationStatus: "done",
		});
	} catch (error) {
		await updatePostgresById(postgresId, {
			applicationStatus: "error",
		});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Error on deploy postgres${error}`,
		});
	}
	return postgres;
};

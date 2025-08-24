import { db } from "@dokploy/server/db";
import {
	type apiCreatePostgres,
	backups,
	buildAppName,
	postgres,
} from "@dokploy/server/db/schema";
import { generatePassword } from "@dokploy/server/templates";
import { buildPostgres } from "@dokploy/server/utils/databases/postgres";
import { pullImage } from "@dokploy/server/utils/docker/utils";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq, getTableColumns } from "drizzle-orm";
import { validUniqueServerAppName } from "./project";

export type Postgres = typeof postgres.$inferSelect;

export const createPostgres = async (input: typeof apiCreatePostgres._type) => {
	const appName = buildAppName("postgres", input.appName);

	const valid = await validUniqueServerAppName(appName);
	if (!valid) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Service with this 'AppName' already exists",
		});
	}

	const newPostgres = await db
		.insert(postgres)
		.values({
			...input,
			databasePassword: input.databasePassword
				? input.databasePassword
				: generatePassword(),
			appName,
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
	const { appName, ...rest } = postgresData;
	const result = await db
		.update(postgres)
		.set({
			...rest,
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

export const deployPostgres = async (
	postgresId: string,
	onData?: (data: any) => void,
) => {
	const postgres = await findPostgresById(postgresId);
	try {
		await updatePostgresById(postgresId, {
			applicationStatus: "running",
		});

		onData?.("Starting postgres deployment...");

		if (postgres.serverId) {
			await execAsyncRemote(
				postgres.serverId,
				`docker pull ${postgres.dockerImage}`,
				onData,
			);
		} else {
			await pullImage(postgres.dockerImage, onData);
		}

		await buildPostgres(postgres);

		await updatePostgresById(postgresId, {
			applicationStatus: "done",
		});

		onData?.("Deployment completed successfully!");
	} catch (error) {
		onData?.(`Error: ${error}`);
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

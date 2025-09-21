import { db } from "@dokploy/server/db";
import {
	type apiCreateLibsql,
	buildAppName,
	libsql,
} from "@dokploy/server/db/schema";
import { generatePassword } from "@dokploy/server/templates";
import { buildLibsql } from "@dokploy/server/utils/databases/libsql";
import { pullImage } from "@dokploy/server/utils/docker/utils";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { validUniqueServerAppName } from "./project";

export type Libsql = typeof libsql.$inferSelect;

export const createLibsql = async (input: typeof apiCreateLibsql._type) => {
	const appName = buildAppName("libsql", input.appName);

	const valid = await validUniqueServerAppName(input.appName);
	if (!valid) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Service with this 'AppName' already exists",
		});
	}

	const newLibsql = await db
		.insert(libsql)
		.values({
			...input,
			databasePassword: input.databasePassword
				? input.databasePassword
				: generatePassword(),
			appName,
		})
		.returning()
		.then((value) => value[0]);

	if (!newLibsql) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting libsql database",
		});
	}

	return newLibsql;
};

// https://github.com/drizzle-team/drizzle-orm/discussions/1483#discussioncomment-7523881
export const findLibsqlById = async (libsqlId: string) => {
	const result = await db.query.libsql.findFirst({
		where: eq(libsql.libsqlId, libsqlId),
		with: {
			environment: {
				with: {
					project: true,
				},
			},
			mounts: true,
			server: true,
			bottomlessReplicationDestination: true,
			// backups: {
			// 	with: {
			// 		destination: true,
			// 		deployments: true,
			// 	},
			// },
		},
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Libsql not found",
		});
	}
	return result;
};

export const updateLibsqlById = async (
	libsqlId: string,
	libsqlData: Partial<Libsql>,
) => {
	const { appName, ...rest } = libsqlData;
	const result = await db
		.update(libsql)
		.set({
			...rest,
		})
		.where(eq(libsql.libsqlId, libsqlId))
		.returning();

	return result[0];
};

export const removeLibsqlById = async (libsqlId: string) => {
	const result = await db
		.delete(libsql)
		.where(eq(libsql.libsqlId, libsqlId))
		.returning();

	return result[0];
};

// export const findLibsqlByBackupId = async (backupId: string) => {
// 	const result = await db
// 		.select({
// 			...getTableColumns(libsql),
// 		})
// 		.from(libsql)
// 		.innerJoin(backups, eq(libsql.libsqlId, backups.libsqlId))
// 		.where(eq(backups.backupId, backupId))
// 		.limit(1);
//
// 	if (!result || !result[0]) {
// 		throw new TRPCError({
// 			code: "NOT_FOUND",
// 			message: "Libsql not found",
// 		});
// 	}
// 	return result[0];
// };

export const deployLibsql = async (
	libsqlId: string,
	onData?: (data: any) => void,
) => {
	const libsql = await findLibsqlById(libsqlId);
	try {
		await updateLibsqlById(libsqlId, {
			applicationStatus: "running",
		});
		onData?.("Starting libsql deployment...");
		if (libsql.serverId) {
			await execAsyncRemote(
				libsql.serverId,
				`docker pull ${libsql.dockerImage}`,
				onData,
			);
		} else {
			await pullImage(libsql.dockerImage, onData);
		}

		await buildLibsql(libsql);
		await updateLibsqlById(libsqlId, {
			applicationStatus: "done",
		});
		onData?.("Deployment completed successfully!");
	} catch (error) {
		onData?.(`Error: ${error}`);
		await updateLibsqlById(libsqlId, {
			applicationStatus: "error",
		});

		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Error on deploy libsql${error}`,
		});
	}
	return libsql;
};

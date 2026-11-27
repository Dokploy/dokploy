import { db } from "@dokploy/server/db";
import {
	checkServicePermissionAndAccess,
	type PermissionCtx,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";

export type DatabaseRestoreType =
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "libsql";

const findServiceIdByAppName = async (
	type: DatabaseRestoreType,
	appName: string,
): Promise<string | undefined> => {
	switch (type) {
		case "postgres":
			return (
				await db.query.postgres.findFirst({
					where: (t, { eq }) => eq(t.appName, appName),
					columns: { postgresId: true },
				})
			)?.postgresId;
		case "mysql":
			return (
				await db.query.mysql.findFirst({
					where: (t, { eq }) => eq(t.appName, appName),
					columns: { mysqlId: true },
				})
			)?.mysqlId;
		case "mariadb":
			return (
				await db.query.mariadb.findFirst({
					where: (t, { eq }) => eq(t.appName, appName),
					columns: { mariadbId: true },
				})
			)?.mariadbId;
		case "mongo":
			return (
				await db.query.mongo.findFirst({
					where: (t, { eq }) => eq(t.appName, appName),
					columns: { mongoId: true },
				})
			)?.mongoId;
		case "libsql":
			return (
				await db.query.libsql.findFirst({
					where: (t, { eq }) => eq(t.appName, appName),
					columns: { libsqlId: true },
				})
			)?.libsqlId;
	}
};

/**
 * A backup may be restored into a service when it lives in that service's own
 * folder, or in the folder of another service of the same type that the user
 * is allowed to read backups from (e.g. refreshing a dev DB from production).
 */
export const assertCanRestoreBackupFile = async (
	ctx: PermissionCtx,
	type: DatabaseRestoreType,
	targetAppName: string,
	backupFile: string,
) => {
	const denied = () =>
		new TRPCError({
			code: "UNAUTHORIZED",
			message: "Backup file does not belong to this service",
		});

	if (backupFile.split("/").includes("..")) {
		throw denied();
	}
	if (backupFile.startsWith(`${targetAppName}/`)) {
		return;
	}

	const sourceAppName = backupFile.split("/")[0];
	if (!sourceAppName || !backupFile.includes("/")) {
		throw denied();
	}
	const sourceId = await findServiceIdByAppName(type, sourceAppName);
	if (!sourceId) {
		throw denied();
	}
	try {
		await checkServicePermissionAndAccess(ctx, sourceId, {
			backup: ["read"],
		});
	} catch {
		throw denied();
	}
};

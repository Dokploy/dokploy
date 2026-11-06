import type { DatabaseScheduleType } from "@dokploy/server/db/schema/schedule";
import { findLibsqlById } from "@dokploy/server/services/libsql";
import { findMariadbById } from "@dokploy/server/services/mariadb";
import { findMongoById } from "@dokploy/server/services/mongo";
import { findMySqlById } from "@dokploy/server/services/mysql";
import {
	checkServicePermissionAndAccess,
	type PermissionCtx,
} from "@dokploy/server/services/permission";
import { findPostgresById } from "@dokploy/server/services/postgres";
import { findRedisById } from "@dokploy/server/services/redis";
import { TRPCError } from "@trpc/server";

/** Database schedules may only be managed by members of the owning organization. */
export const checkDatabaseScheduleAccess = async (
	ctx: PermissionCtx,
	databaseType: DatabaseScheduleType,
	id: string,
	permissions: Parameters<typeof checkServicePermissionAndAccess>[2],
) => {
	await checkServicePermissionAndAccess(ctx, id, permissions);

	const service = await (async () => {
		switch (databaseType) {
			case "postgres":
				return findPostgresById(id);
			case "mysql":
				return findMySqlById(id);
			case "mariadb":
				return findMariadbById(id);
			case "mongo":
				return findMongoById(id);
			case "redis":
				return findRedisById(id);
			case "libsql":
				return findLibsqlById(id);
			default:
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Unsupported database type.",
				});
		}
	})();

	if (
		service.environment.project.organizationId !==
		ctx.session.activeOrganizationId
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have access to this database.",
		});
	}
};

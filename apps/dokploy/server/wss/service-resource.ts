import { db } from "@dokploy/server/db";
import {
	applications,
	compose,
	environments,
	libsql,
	mariadb,
	mongo,
	mysql,
	postgres,
	projects,
	redis,
} from "@dokploy/server/db/schema";
import { and, eq, sql } from "drizzle-orm";

// Resolve the organization and deployment target from persisted data, never
// from the service ID or app name supplied by a WebSocket client.
export const findWssService = async (
	serviceId: string,
	organizationId: string,
) => {
	const configs = [
		{ table: applications, id: applications.applicationId },
		{ table: compose, id: compose.composeId },
		{ table: postgres, id: postgres.postgresId },
		{ table: mysql, id: mysql.mysqlId },
		{ table: mariadb, id: mariadb.mariadbId },
		{ table: mongo, id: mongo.mongoId },
		{ table: redis, id: redis.redisId },
		{ table: libsql, id: libsql.libsqlId },
	];
	for (const { table, id } of configs) {
		const [service] = await db
			.select({
				appName: table.appName,
				serverId: table.serverId,
				appType:
					table === compose ? compose.composeType : sql<string>`'application'`,
			})
			.from(table)
			.innerJoin(
				environments,
				eq(table.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId))
			.where(
				and(eq(id, serviceId), eq(projects.organizationId, organizationId)),
			)
			.limit(1);
		if (service) return service;
	}
	return null;
};

import { db } from "@dokploy/server/db";
import { param, sql } from "drizzle-orm";

export type MemberAccess = {
	accessedProjects: string[];
	accessedEnvironments: string[];
	accessedServices: string[];
};

export type AccessScope = {
	serviceIds: string[];
	environmentIds: string[];
	projectIds: string[];
};

type ScopeRow = {
	environmentId: string;
	projectId: string;
	serviceId: string | null;
};

const reachableRows = async (member: MemberAccess): Promise<ScopeRow[]> => {
	const rows = await db.execute(sql`
		WITH svc AS (
			SELECT "applicationId" AS "serviceId", "environmentId" FROM "application"
			UNION ALL SELECT "composeId", "environmentId" FROM "compose"
			UNION ALL SELECT "libsqlId", "environmentId" FROM "libsql"
			UNION ALL SELECT "mariadbId", "environmentId" FROM "mariadb"
			UNION ALL SELECT "mongoId", "environmentId" FROM "mongo"
			UNION ALL SELECT "mysqlId", "environmentId" FROM "mysql"
			UNION ALL SELECT "postgresId", "environmentId" FROM "postgres"
			UNION ALL SELECT "redisId", "environmentId" FROM "redis"
		)
		SELECT e."environmentId", e."projectId", svc."serviceId"
		FROM "environment" e
		LEFT JOIN svc ON svc."environmentId" = e."environmentId"
		WHERE e."projectId" = ANY(${param(member.accessedProjects)}::text[])
			OR e."environmentId" = ANY(${param(member.accessedEnvironments)}::text[])
			OR svc."serviceId" = ANY(${param(member.accessedServices)}::text[])
	`);
	return rows as unknown as ScopeRow[];
};

export const resolveAccessScope = async (
	member: MemberAccess,
): Promise<AccessScope> => {
	const holdsNothing =
		member.accessedProjects.length === 0 &&
		member.accessedEnvironments.length === 0 &&
		member.accessedServices.length === 0;

	if (holdsNothing) {
		return { serviceIds: [], environmentIds: [], projectIds: [] };
	}

	const rows = await reachableRows(member);

	const projectIds = new Set(member.accessedProjects);
	const environmentIds = new Set(member.accessedEnvironments);
	const serviceIds = new Set(member.accessedServices);

	for (const row of rows) {
		projectIds.add(row.projectId);
		environmentIds.add(row.environmentId);

		const inherits =
			member.accessedProjects.includes(row.projectId) ||
			member.accessedEnvironments.includes(row.environmentId);

		if (inherits && row.serviceId) {
			serviceIds.add(row.serviceId);
		}
	}

	return {
		serviceIds: [...serviceIds],
		environmentIds: [...environmentIds],
		projectIds: [...projectIds],
	};
};

export const getEffectiveAccessedServices = async (
	member: MemberAccess,
): Promise<string[]> => {
	if (
		member.accessedProjects.length === 0 &&
		member.accessedEnvironments.length === 0
	) {
		return [...member.accessedServices];
	}
	return (await resolveAccessScope(member)).serviceIds;
};

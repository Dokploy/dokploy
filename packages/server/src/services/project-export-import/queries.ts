import type { db as RealDb } from "@dokploy/server/db";
import type { ServiceType } from "./types";

export type TransferDb = Pick<typeof RealDb, "query">;
export type TransferTx = Pick<typeof RealDb, "query" | "insert" | "update">;
export type TransferWriteDb = Pick<
	typeof RealDb,
	"query" | "insert" | "update" | "transaction"
>;

export const SERVICE_TYPES = [
	"application",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"compose",
	"libsql",
] as const satisfies readonly ServiceType[];

export const SERVICE_ID_FIELD: Record<ServiceType, string> = {
	application: "applicationId",
	postgres: "postgresId",
	mysql: "mysqlId",
	mariadb: "mariadbId",
	mongo: "mongoId",
	redis: "redisId",
	compose: "composeId",
	libsql: "libsqlId",
};

const CHILD_RELATIONS: Record<ServiceType, string[]> = {
	application: ["domains", "mounts", "redirects", "security", "ports"],
	compose: ["domains", "mounts"],
	postgres: ["mounts"],
	mysql: ["mounts"],
	mariadb: ["mounts"],
	mongo: ["mounts"],
	redis: ["mounts"],
	libsql: ["mounts"],
};

export const childKeysOf = (type: ServiceType) => CHILD_RELATIONS[type];

export const loadProjectTree = async (db: TransferDb, projectId: string) => {
	const project = await db.query.projects.findFirst({
		where: (fields, { eq }) => eq(fields.projectId, projectId),
		with: {
			projectTags: { with: { tag: true } },
			environments: {
				with: {
					compose: { with: { domains: true, mounts: true } },
					postgres: { with: { mounts: true } },
					mysql: { with: { mounts: true } },
					mariadb: { with: { mounts: true } },
					mongo: { with: { mounts: true } },
					libsql: { with: { mounts: true } },
					redis: { with: { mounts: true } },
				},
			},
		},
	});
	if (!project) return undefined;

	// Nesting applications under environments exceeds Postgres' 63-char alias limit.
	const applications = await db.query.applications.findMany({
		where: (fields, { inArray }) =>
			inArray(
				fields.environmentId,
				project.environments.map((env) => env.environmentId),
			),
		with: {
			domains: true,
			mounts: true,
			redirects: true,
			security: true,
			ports: true,
		},
	});
	return {
		...project,
		environments: project.environments.map((env) => ({
			...env,
			applications: applications.filter(
				(app) => app.environmentId === env.environmentId,
			),
		})),
	};
};

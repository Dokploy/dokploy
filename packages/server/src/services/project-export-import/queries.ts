import type { db as RealDb } from "@dokploy/server/db";
import type {
	applications,
	backups,
	compose,
	domains,
	environments,
	libsql,
	mariadb,
	mongo,
	mounts,
	mysql,
	ports,
	postgres,
	projects,
	redirects,
	redis,
	schedules,
	security,
	volumeBackups,
} from "@dokploy/server/db/schema";
import type { InferSelectModel, Table } from "drizzle-orm";
import type { CaptureSource } from "./types";

export type TransferDb = Pick<typeof RealDb, "query">;

export type TransferWriteDb = Pick<
	typeof RealDb,
	"query" | "insert" | "update" | "transaction"
>;
export type TransferTx = Pick<typeof RealDb, "query" | "insert" | "update">;

type Mount = InferSelectModel<typeof mounts>;
type Backup = InferSelectModel<typeof backups>;
type Schedule = InferSelectModel<typeof schedules>;
type VolumeBackup = InferSelectModel<typeof volumeBackups>;

export type ApplicationRow = InferSelectModel<typeof applications> & {
	domains: InferSelectModel<typeof domains>[];
	mounts: Mount[];
	redirects: InferSelectModel<typeof redirects>[];
	security: InferSelectModel<typeof security>[];
	ports: InferSelectModel<typeof ports>[];
	schedules: Schedule[];
	volumeBackups: VolumeBackup[];
};

export type ComposeRow = InferSelectModel<typeof compose> & {
	domains: InferSelectModel<typeof domains>[];
	mounts: Mount[];
	backups: Backup[];
	schedules: Schedule[];
	volumeBackups: VolumeBackup[];
};

type DbServiceRow<T extends Table> = InferSelectModel<T> & {
	mounts: Mount[];
	backups: Backup[];
	volumeBackups: VolumeBackup[];
};

export type PostgresRow = DbServiceRow<typeof postgres>;
export type MysqlRow = DbServiceRow<typeof mysql>;
export type MariadbRow = DbServiceRow<typeof mariadb>;
export type MongoRow = DbServiceRow<typeof mongo>;
export type LibsqlRow = DbServiceRow<typeof libsql>;

export type RedisRow = InferSelectModel<typeof redis> & {
	mounts: Mount[];
	volumeBackups: VolumeBackup[];
};

export type EnvironmentRow = InferSelectModel<typeof environments> & {
	applications: ApplicationRow[];
	compose: ComposeRow[];
	postgres: PostgresRow[];
	mysql: MysqlRow[];
	mariadb: MariadbRow[];
	mongo: MongoRow[];
	redis: RedisRow[];
	libsql: LibsqlRow[];
};

export type ProjectTree = InferSelectModel<typeof projects> & {
	environments: EnvironmentRow[];
	projectTags?: { tag: { name: string; color: string | null } }[];
};

const DB_SERVICE_WITH = { mounts: true, backups: true } as const;

export const loadProjectTree = async (
	db: TransferDb,
	source: CaptureSource,
): Promise<ProjectTree | undefined> => {
	const project = await db.query.projects.findFirst({
		where: (fields, { eq }) => eq(fields.projectId, source.id),
		with: {
			projectTags: { with: { tag: true } },
			environments: {
				with: {
					compose: {
						with: {
							domains: true,
							mounts: true,
							backups: true,
							schedules: true,
						},
					},
					postgres: { with: DB_SERVICE_WITH },
					mysql: { with: DB_SERVICE_WITH },
					mariadb: { with: DB_SERVICE_WITH },
					mongo: { with: DB_SERVICE_WITH },
					libsql: { with: DB_SERVICE_WITH },
					redis: { with: { mounts: true } },
				},
			},
		},
	});

	if (!project) {
		return undefined;
	}

	const tree = project as unknown as ProjectTree;
	await attachApplications(db, tree);
	await attachApplicationSchedules(db, tree);
	await attachVolumeBackups(db, tree);
	return tree;
};

const attachApplications = async (db: TransferDb, tree: ProjectTree) => {
	const environmentIds = tree.environments.map((env) => env.environmentId);
	if (environmentIds.length === 0) {
		return;
	}
	const rows = await db.query.applications.findMany({
		where: (fields, { inArray }) =>
			inArray(fields.environmentId, environmentIds),
		with: {
			domains: true,
			mounts: true,
			redirects: true,
			security: true,
			ports: true,
		},
	});
	const byEnvironmentId = groupBy(rows, (row) => row.environmentId);
	for (const env of tree.environments) {
		env.applications = (byEnvironmentId.get(env.environmentId) ??
			[]) as unknown as ApplicationRow[];
	}
};

const attachApplicationSchedules = async (
	db: TransferDb,
	tree: ProjectTree,
) => {
	const applicationIds = tree.environments.flatMap((env) =>
		env.applications.map((app) => app.applicationId),
	);
	if (applicationIds.length === 0) {
		return;
	}
	const rows = await db.query.schedules.findMany({
		where: (fields, { inArray }) =>
			inArray(fields.applicationId, applicationIds),
	});
	const byApplicationId = groupBy(rows, (row) => row.applicationId);
	for (const env of tree.environments) {
		for (const app of env.applications) {
			app.schedules = byApplicationId.get(app.applicationId) ?? [];
		}
	}
};

type VolumeBackupOwner = { volumeBackups: VolumeBackup[] };

const volumeBackupOwnerGroups = (
	tree: ProjectTree,
): {
	field: (typeof VOLUME_BACKUP_ID_FIELDS)[number];
	services: (VolumeBackupOwner & Record<string, unknown>)[];
}[] => [
	{
		field: "applicationId",
		services: tree.environments.flatMap((env) => env.applications),
	},
	{
		field: "composeId",
		services: tree.environments.flatMap((env) => env.compose),
	},
	{
		field: "postgresId",
		services: tree.environments.flatMap((env) => env.postgres),
	},
	{ field: "mysqlId", services: tree.environments.flatMap((env) => env.mysql) },
	{
		field: "mariadbId",
		services: tree.environments.flatMap((env) => env.mariadb),
	},
	{ field: "mongoId", services: tree.environments.flatMap((env) => env.mongo) },
	{ field: "redisId", services: tree.environments.flatMap((env) => env.redis) },
	{
		field: "libsqlId",
		services: tree.environments.flatMap((env) => env.libsql),
	},
];

const VOLUME_BACKUP_ID_FIELDS = [
	"applicationId",
	"postgresId",
	"mysqlId",
	"mariadbId",
	"mongoId",
	"redisId",
	"libsqlId",
	"composeId",
] as const;

const attachVolumeBackups = async (db: TransferDb, tree: ProjectTree) => {
	const groups = volumeBackupOwnerGroups(tree);
	const activeGroups = groups.filter((group) => group.services.length > 0);
	if (activeGroups.length === 0) {
		return;
	}

	const rows = await db.query.volumeBackups.findMany({
		where: (fields, { inArray, or }) =>
			or(
				...activeGroups.map((group) =>
					inArray(
						fields[group.field],
						group.services.map((service) => service[group.field] as string),
					),
				),
			),
	});

	for (const group of activeGroups) {
		for (const service of group.services) {
			service.volumeBackups = rows.filter(
				(row) => row[group.field] === service[group.field],
			);
		}
	}
};

const groupBy = <T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> => {
	const map = new Map<K, T[]>();
	for (const item of items) {
		const key = keyOf(item);
		const bucket = map.get(key);
		if (bucket) {
			bucket.push(item);
		} else {
			map.set(key, [item]);
		}
	}
	return map;
};

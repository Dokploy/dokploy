import type { BackupSchedule } from "@dokploy/server/services/backup";

const databaseBackupServiceFields = [
	{ databaseType: "postgres", idField: "postgresId", relation: "postgres" },
	{ databaseType: "mysql", idField: "mysqlId", relation: "mysql" },
	{ databaseType: "mariadb", idField: "mariadbId", relation: "mariadb" },
	{ databaseType: "mongo", idField: "mongoId", relation: "mongo" },
	{ databaseType: "libsql", idField: "libsqlId", relation: "libsql" },
] as const;

type BackupScheduleTarget = Pick<
	BackupSchedule,
	| "backupType"
	| "databaseType"
	| "compose"
	| "composeId"
	| "libsql"
	| "libsqlId"
	| "mariadb"
	| "mariadbId"
	| "mongo"
	| "mongoId"
	| "mysql"
	| "mysqlId"
	| "postgres"
	| "postgresId"
>;

const getBackupServiceBindings = (backup: BackupScheduleTarget) =>
	databaseBackupServiceFields
		.filter(({ idField }) => Boolean(backup[idField]))
		.map(({ databaseType, relation }) => ({
			databaseType,
			relation,
		}));

export const isBackupScheduleTargetBound = (backup: BackupScheduleTarget) => {
	const databaseBindings = getBackupServiceBindings(backup);
	const hasComposeBinding = Boolean(backup.composeId);

	if (backup.backupType === "compose") {
		return (
			hasComposeBinding &&
			Boolean(backup.compose) &&
			databaseBindings.length === 0
		);
	}

	if (backup.databaseType === "web-server") {
		return !hasComposeBinding && databaseBindings.length === 0;
	}

	const expectedBinding = databaseBindings[0];
	if (
		hasComposeBinding ||
		databaseBindings.length !== 1 ||
		expectedBinding?.databaseType !== backup.databaseType
	) {
		return false;
	}

	return Boolean(backup[expectedBinding.relation]);
};

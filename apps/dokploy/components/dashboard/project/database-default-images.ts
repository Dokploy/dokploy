export type DatabaseType =
	| "mongo"
	| "libsql"
	| "mariadb"
	| "mysql"
	| "postgres"
	| "redis";

export const dockerImageDefaultPlaceholder: Record<DatabaseType, string> = {
	mongo: "mongo:8",
	libsql: "ghcr.io/tursodatabase/libsql-server:v0.24.32",
	mariadb: "mariadb:11",
	mysql: "mysql:8",
	postgres: "postgres:18",
	redis: "redis:8",
};

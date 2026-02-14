import fs from "node:fs";

export const {
	DATABASE_URL,
	POSTGRES_PASSWORD_FILE,
	POSTGRES_USER = "dokploy",
	POSTGRES_DB = "dokploy",
	POSTGRES_HOST = "dokploy-postgres",
	POSTGRES_PORT = "5432",
} = process.env;

function readSecret(path: string): string {
	try {
		return fs.readFileSync(path, "utf8").trim();
	} catch {
		throw new Error(`Cannot read secret at ${path}`);
	}
}
export let dbUrl: string;
if (DATABASE_URL) {
	dbUrl = DATABASE_URL;
} else if (POSTGRES_PASSWORD_FILE) {
	const password = readSecret(POSTGRES_PASSWORD_FILE);
	dbUrl = `postgres://${POSTGRES_USER}:${encodeURIComponent(
		password,
	)}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`;
} else {
	if (process.env.NODE_ENV !== "test") {
		console.warn(`
		⚠️  [DEPRECATED DATABASE CONFIG]
		You are using the legacy hardcoded database credentials.
		This mode WILL BE REMOVED in a future release.
		
		Please migrate to Docker Secrets using POSTGRES_PASSWORD_FILE.
		Please execute this command in your server: curl -sSL https://dokploy.com/security/0.26.6.sh | bash
		`);
	}

	if (process.env.NODE_ENV === "production") {
		dbUrl =
			"postgres://dokploy:amukds4wi9001583845717ad2@dokploy-postgres:5432/dokploy";
	} else {
		dbUrl =
			"postgres://dokploy:amukds4wi9001583845717ad2@localhost:5432/dokploy";
	}
}

const INTERNAL_DB_HOSTS = new Set(["dokploy-postgres", "localhost", "127.0.0.1"]);

/**
 * Returns true when Dokploy is configured to use an external PostgreSQL
 * instance (not the built-in Docker Swarm service or localhost dev).
 */
export const isExternalDatabase = (): boolean => {
	try {
		const url = new URL(dbUrl);
		return !INTERNAL_DB_HOSTS.has(url.hostname);
	} catch {
		return false;
	}
};

/**
 * Returns true when Dokploy is configured to use an external Redis
 * instance (not the built-in Docker Swarm service).
 */
export const isExternalRedis = (): boolean => {
	return !!(process.env.REDIS_URL || (process.env.REDIS_HOST && process.env.REDIS_HOST !== "dokploy-redis"));
};

export interface PostgresCredentials {
	user: string;
	database: string;
	host: string;
	port: string;
	password: string;
}

/**
 * Parses PostgreSQL credentials from the resolved database URL.
 * Shared by backup and restore code paths.
 */
export const getPostgresCredentials = (): PostgresCredentials => {
	try {
		const url = new URL(dbUrl);
		return {
			user: decodeURIComponent(url.username) || POSTGRES_USER || "dokploy",
			database: url.pathname.replace(/^\//, "") || POSTGRES_DB || "dokploy",
			host: url.hostname,
			port: url.port || "5432",
			password: decodeURIComponent(url.password),
		};
	} catch {
		return {
			user: POSTGRES_USER || "dokploy",
			database: POSTGRES_DB || "dokploy",
			host: "dokploy-postgres",
			port: "5432",
			password: "",
		};
	}
};

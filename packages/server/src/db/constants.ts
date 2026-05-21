import fs from "node:fs";

export const {
	DATABASE_URL,
	POSTGRES_PASSWORD_FILE,
	POSTGRES_USER = "dokploy",
	POSTGRES_DB = "dokploy",
	POSTGRES_HOST = "dokploy-postgres",
	POSTGRES_PORT = "5432",
	REDIS_URL,
	REDIS_HOST,
	REDIS_PORT,
	REDIS_PASSWORD,
	REDIS_PASSWORD_FILE,
	REDIS_DB_INDEX,
	REDIS_USERNAME,
} = process.env;

export function readSecret(path: string): string {
	try {
		return fs.readFileSync(path, "utf8").trim();
	} catch {
		throw new Error(`Cannot read secret at ${path}`);
	}
}
export let dbUrl: string;
if (DATABASE_URL) {
	// Compatibilidad legacy / overrides
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

const redisPassword = REDIS_PASSWORD_FILE
	? readSecret(REDIS_PASSWORD_FILE)
	: REDIS_PASSWORD;

export const redisConfig = REDIS_URL
	? { url: REDIS_URL }
	: {
			host:
				REDIS_HOST ||
				(process.env.NODE_ENV === "production" ? "dokploy-redis" : "127.0.0.1"),
			port: REDIS_PORT ? Number.parseInt(REDIS_PORT, 10) : 6379,
			db: REDIS_DB_INDEX ? Number.parseInt(REDIS_DB_INDEX, 10) : 0,
			...(redisPassword && { password: redisPassword }),
			...(REDIS_USERNAME && { username: REDIS_USERNAME }),
		};

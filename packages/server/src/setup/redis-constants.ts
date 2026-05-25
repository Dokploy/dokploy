import fs from "node:fs";

export const {
	REDIS_URL,
	REDIS_HOST,
	REDIS_PORT,
	REDIS_PASSWORD,
	REDIS_PASSWORD_FILE,
	REDIS_DB_INDEX,
	REDIS_USERNAME,
} = process.env;

export function readSecret(path: string): string | undefined {
	try {
		return fs.readFileSync(path, "utf8").trim();
	} catch (error) {
		console.error(
			`Cannot read secret at ${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return undefined;
	}
}

export const getRedisPassword = (): string | undefined => {
	return REDIS_PASSWORD_FILE
		? (readSecret(REDIS_PASSWORD_FILE) ?? REDIS_PASSWORD)
		: REDIS_PASSWORD;
};

const parseNumeric = (
	value: string | undefined,
	defaultValue: number,
): number => {
	if (!value) return defaultValue;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : defaultValue;
};

/**
 * Common Redis configuration shape.
 */
export const redisConfig = REDIS_URL
	? { url: REDIS_URL }
	: {
			host:
				REDIS_HOST ||
				(process.env.NODE_ENV === "production" ? "dokploy-redis" : "127.0.0.1"),
			port: parseNumeric(REDIS_PORT, 6379),
			db: parseNumeric(REDIS_DB_INDEX, 0),
			password: getRedisPassword(),
			username: REDIS_USERNAME,
		};

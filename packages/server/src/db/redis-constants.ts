import fs from 'node:fs';

export const {
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
		return fs.readFileSync(path, 'utf8').trim();
	} catch {
		throw new Error('Cannot read secret at ' + path);
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
				(process.env.NODE_ENV === 'production' ? 'dokploy-redis' : '127.0.0.1'),
			port: REDIS_PORT ? Number.parseInt(REDIS_PORT, 10) : 6379,
			db: REDIS_DB_INDEX ? Number.parseInt(REDIS_DB_INDEX, 10) : 0,
			...(redisPassword && { password: redisPassword }),
			...(REDIS_USERNAME && { username: REDIS_USERNAME }),
		};
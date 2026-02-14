import type { ConnectionOptions } from "bullmq";

function buildRedisConfig(): ConnectionOptions {
	const redisUrl = process.env.REDIS_URL;
	if (redisUrl) {
		try {
			const url = new URL(redisUrl);
			return {
				host: url.hostname,
				port: Number(url.port) || 6379,
				...(url.password && { password: decodeURIComponent(url.password) }),
				...(url.username &&
					url.username !== "" && {
						username: decodeURIComponent(url.username),
					}),
				...(url.protocol === "rediss:" && { tls: {} }),
			};
		} catch {
			console.error(
				"[redis-connection] Invalid REDIS_URL, falling back to defaults",
			);
		}
	}

	const host =
		process.env.NODE_ENV === "production"
			? process.env.REDIS_HOST || "dokploy-redis"
			: "127.0.0.1";

	const port = Number(process.env.REDIS_PORT) || 6379;

	return {
		host,
		port,
		...(process.env.REDIS_PASSWORD && {
			password: process.env.REDIS_PASSWORD,
		}),
	};
}

export const redisConfig: ConnectionOptions = buildRedisConfig();

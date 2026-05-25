import { redisConfig as sharedRedisConfig } from "@dokploy/server/setup/redis-constants";
import type { ConnectionOptions } from "bullmq";

export const redisConfig: ConnectionOptions =
	"url" in sharedRedisConfig
		? { url: sharedRedisConfig.url }
		: {
				host: sharedRedisConfig.host,
				port: sharedRedisConfig.port,
				db: sharedRedisConfig.db,
				password: sharedRedisConfig.password,
				username: sharedRedisConfig.username,
			};


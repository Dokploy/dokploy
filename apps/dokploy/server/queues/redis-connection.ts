import { redisConfig as sharedRedisConfig } from "@dokploy/server/setup/redis-constants";
import type { ConnectionOptions } from "bullmq";

export const redisConfig: ConnectionOptions =
	"url" in sharedRedisConfig
		? { url: sharedRedisConfig.url as string }
		: {
				host: sharedRedisConfig.host as string,
				port: sharedRedisConfig.port as number,
				db: sharedRedisConfig.db as number,
				password: sharedRedisConfig.password as string | undefined,
				username: sharedRedisConfig.username as string | undefined,
			};

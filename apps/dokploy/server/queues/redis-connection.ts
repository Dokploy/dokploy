import { redisConfig as sharedRedisConfig } from "@dokploy/server/setup/redis-constants";
import type { ConnectionOptions } from "bullmq";

export const redisConfig: ConnectionOptions =
	sharedRedisConfig as unknown as ConnectionOptions;

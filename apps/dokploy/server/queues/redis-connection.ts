import { redisConfig as sharedRedisConfig } from "@dokploy/server/db/redis-constants";
import type { ConnectionOptions } from "bullmq";

export const redisConfig = sharedRedisConfig as ConnectionOptions;

import { redisConfig as sharedRedisConfig } from "@dokploy/server";
import type { ConnectionOptions } from "bullmq";

export const redisConfig = sharedRedisConfig as ConnectionOptions;

CREATE TYPE "public"."redisEngine" AS ENUM('redis', 'valkey');--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "engine" "redisEngine" DEFAULT 'redis' NOT NULL;
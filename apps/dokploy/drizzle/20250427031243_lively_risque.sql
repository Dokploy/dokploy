CREATE TYPE "public"."triggerType" AS ENUM('push', 'tag');--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "triggerType" "triggerType" DEFAULT 'push';--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "triggerType" "triggerType" DEFAULT 'push';
ALTER TYPE "public"."applicationStatus" ADD VALUE 'paused';--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "pausedAt" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "pausedAt" text;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "pausedAt" text;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "pausedAt" text;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "pausedAt" text;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "pausedAt" text;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "pausedAt" text;
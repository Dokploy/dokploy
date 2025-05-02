CREATE TYPE "public"."shellType" AS ENUM('bash', 'sh');--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN "shellType" "shellType" DEFAULT 'bash' NOT NULL;
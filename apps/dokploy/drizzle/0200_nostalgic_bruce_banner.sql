CREATE TYPE "public"."testExecSource" AS ENUM('command', 'generated');--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "testExecSource" "testExecSource" DEFAULT 'command' NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "testRunnerImage" text;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "testExecSummary" jsonb;
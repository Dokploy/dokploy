CREATE TYPE "public"."publishModeType" AS ENUM('ingress', 'host');--> statement-breakpoint
ALTER TABLE "port" ADD COLUMN "publishMode" "publishModeType" DEFAULT 'host' NOT NULL;
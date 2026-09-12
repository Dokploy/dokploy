CREATE TYPE "public"."buildArchitecture" AS ENUM('host', 'amd64', 'arm64', 'multi');--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "buildArchitecture" "buildArchitecture" DEFAULT 'host' NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "buildxBuilder" text;
CREATE TYPE "public"."serverType" AS ENUM('deploy', 'build');--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "serverType" "serverType" DEFAULT 'deploy' NOT NULL;
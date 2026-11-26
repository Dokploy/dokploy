ALTER TABLE "cloud_server" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "cloud_server" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."cloudServerStatus";--> statement-breakpoint
CREATE TYPE "public"."cloudServerStatus" AS ENUM('provisioning', 'configuring', 'ready', 'upgrading', 'error', 'suspended', 'terminating');--> statement-breakpoint
ALTER TABLE "cloud_server" ALTER COLUMN "status" SET DATA TYPE "public"."cloudServerStatus" USING "status"::"public"."cloudServerStatus";
-- Add destination type enum and new columns for SFTP and rclone backup destinations
DO $$ BEGIN
 CREATE TYPE "public"."destinationType" AS ENUM('s3', 'sftp', 'rclone');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "destinationType" "destinationType" DEFAULT 's3' NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "sftpHost" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "sftpPort" integer;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "sftpUsername" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "sftpPassword" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "sftpKeyPath" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "sftpRemotePath" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "rcloneConfig" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "rcloneRemoteName" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "rcloneRemotePath" text;--> statement-breakpoint
-- Set default values for existing S3 columns that may have been NOT NULL without defaults
ALTER TABLE "destination" ALTER COLUMN "accessKey" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "secretAccessKey" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "bucket" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "region" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "endpoint" SET DEFAULT '';

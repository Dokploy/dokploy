-- Add destinationType column with default 's3' for backward compatibility
ALTER TABLE "destination" ADD COLUMN "destinationType" text NOT NULL DEFAULT 's3';--> statement-breakpoint
-- Add SFTP/FTP specific fields
ALTER TABLE "destination" ADD COLUMN "host" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "port" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "password" text;--> statement-breakpoint
-- Make S3-specific fields nullable (they may not be set for SFTP/FTP destinations)
ALTER TABLE "destination" ALTER COLUMN "accessKey" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "secretAccessKey" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "bucket" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "region" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "endpoint" DROP NOT NULL;--> statement-breakpoint

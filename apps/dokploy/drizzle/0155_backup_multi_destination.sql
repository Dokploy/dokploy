-- Add multi-provider destination support (SFTP, FTP, Google Drive)
ALTER TABLE "destination" ADD COLUMN "destinationType" text NOT NULL DEFAULT 's3';--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "providerConfig" jsonb;--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "accessKey" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "secretAccessKey" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "bucket" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "region" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "endpoint" SET DEFAULT '';

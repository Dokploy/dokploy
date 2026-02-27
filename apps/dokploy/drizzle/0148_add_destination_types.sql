DO $$ BEGIN
  CREATE TYPE "public"."destinationType" AS ENUM('s3', 'ftp', 'sftp', 'google-drive', 'onedrive', 'custom-rclone');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "destinationType" "destinationType" DEFAULT 's3' NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "ftpHost" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "ftpPort" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "ftpUser" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "ftpPassword" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "ftpBasePath" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "googleDriveClientId" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "googleDriveClientSecret" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "googleDriveToken" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "googleDriveFolderId" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "onedriveClientId" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "onedriveClientSecret" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "onedriveToken" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "onedriveDriveId" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "onedriveFolderId" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "rcloneConfig" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "rcloneRemotePath" text;

ALTER TABLE "destination" ADD COLUMN "sftpHost" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "sftpPort" integer DEFAULT 22;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "sftpUser" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "sftpPassword" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "sftpPath" text;

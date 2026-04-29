ALTER TABLE "notification" ADD COLUMN "backupSuccess" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "backupFailure" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "notification" SET "backupSuccess" = "databaseBackup", "backupFailure" = "databaseBackup";--> statement-breakpoint
ALTER TABLE "notification" DROP COLUMN "databaseBackup";

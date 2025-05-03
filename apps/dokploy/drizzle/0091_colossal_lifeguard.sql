ALTER TABLE "backup" ADD COLUMN "appName" text NOT NULL;--> statement-breakpoint
ALTER TABLE "backup" ADD CONSTRAINT "backup_appName_unique" UNIQUE("appName");
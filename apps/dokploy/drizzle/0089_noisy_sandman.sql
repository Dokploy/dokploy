CREATE TYPE "public"."backupType" AS ENUM('database', 'compose');--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "appName" text NOT NULL;--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "serviceName" text;--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "backupType" "backupType" DEFAULT 'database' NOT NULL;--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "composeId" text;--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "backupId" text;--> statement-breakpoint
ALTER TABLE "backup" ADD CONSTRAINT "backup_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_backupId_backup_backupId_fk" FOREIGN KEY ("backupId") REFERENCES "public"."backup"("backupId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup" ADD CONSTRAINT "backup_appName_unique" UNIQUE("appName");
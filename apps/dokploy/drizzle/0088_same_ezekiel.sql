CREATE TYPE "public"."backupType" AS ENUM('database', 'compose');--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "serviceName" text;--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "backupType" "backupType" DEFAULT 'database' NOT NULL;--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "composeId" text;--> statement-breakpoint
ALTER TABLE "backup" ADD CONSTRAINT "backup_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;
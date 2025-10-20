CREATE TYPE "public"."backupType" AS ENUM('database', 'compose');--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "appName" text;

UPDATE "backup" 
SET "appName" = 'backup-' || 
    (
        ARRAY['optimize', 'parse', 'quantify', 'bypass', 'override', 'generate',
            'secure', 'hack', 'backup', 'connect', 'index', 'compress']::text[]
    )[floor(random() * 12) + 1] || '-' ||
    (
        ARRAY['digital', 'virtual', 'mobile', 'neural', 'optical', 'auxiliary',
            'primary', 'backup', 'wireless', 'haptic', 'solid-state']::text[]
    )[floor(random() * 11) + 1] || '-' ||
    (
        ARRAY['driver', 'protocol', 'array', 'matrix', 'system', 'bandwidth',
            'monitor', 'firewall', 'card', 'sensor', 'bus']::text[]
    )[floor(random() * 11) + 1] || '-' ||
    substr(md5(random()::text), 1, 6);

    
ALTER TABLE "backup" ALTER COLUMN "appName" SET NOT NULL;
ALTER TABLE "backup" ADD COLUMN "serviceName" text;--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "backupType" "backupType" DEFAULT 'database' NOT NULL;--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "composeId" text;--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "backupId" text;--> statement-breakpoint
ALTER TABLE "backup" ADD CONSTRAINT "backup_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_backupId_backup_backupId_fk" FOREIGN KEY ("backupId") REFERENCES "public"."backup"("backupId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup" ADD CONSTRAINT "backup_appName_unique" UNIQUE("appName");
-- Add notification scope enum
DO $$ BEGIN
 CREATE TYPE "public"."notificationScope" AS ENUM('organization', 'project', 'service');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add new columns to notification table
ALTER TABLE "notification" ADD COLUMN "scope" "notificationScope" DEFAULT 'organization' NOT NULL;
ALTER TABLE "notification" ADD COLUMN "isGlobal" boolean DEFAULT true NOT NULL;

-- Create project_notifications table
CREATE TABLE IF NOT EXISTS "project_notifications" (
	"projectNotificationId" text PRIMARY KEY NOT NULL,
	"notificationId" text NOT NULL,
	"projectId" text NOT NULL,
	"createdAt" text NOT NULL
);

-- Create service_notifications table
CREATE TABLE IF NOT EXISTS "service_notifications" (
	"serviceNotificationId" text PRIMARY KEY NOT NULL,
	"notificationId" text NOT NULL,
	"serviceId" text NOT NULL,
	"serviceType" text NOT NULL,
	"createdAt" text NOT NULL
);

-- Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "project_notifications" ADD CONSTRAINT "project_notifications_notificationId_notification_notificationId_fk" FOREIGN KEY ("notificationId") REFERENCES "public"."notification"("notificationId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "project_notifications" ADD CONSTRAINT "project_notifications_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "public"."project"("projectId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "service_notifications" ADD CONSTRAINT "service_notifications_notificationId_notification_notificationId_fk" FOREIGN KEY ("notificationId") REFERENCES "public"."notification"("notificationId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add unique constraints
DO $$ BEGIN
 ALTER TABLE "project_notifications" ADD CONSTRAINT "project_notifications_notificationId_projectId_unique" UNIQUE("notificationId","projectId");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "service_notifications" ADD CONSTRAINT "service_notifications_notificationId_serviceId_serviceType_unique" UNIQUE("notificationId","serviceId","serviceType");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "project_notifications_notificationId_idx" ON "project_notifications" ("notificationId");
CREATE INDEX IF NOT EXISTS "project_notifications_projectId_idx" ON "project_notifications" ("projectId");
CREATE INDEX IF NOT EXISTS "service_notifications_notificationId_idx" ON "service_notifications" ("notificationId");
CREATE INDEX IF NOT EXISTS "service_notifications_serviceId_serviceType_idx" ON "service_notifications" ("serviceId","serviceType");
CREATE INDEX IF NOT EXISTS "notification_scope_idx" ON "notification" ("scope");
CREATE INDEX IF NOT EXISTS "notification_isGlobal_idx" ON "notification" ("isGlobal");

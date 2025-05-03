CREATE TYPE "public"."scheduleType" AS ENUM('application', 'compose', 'server');--> statement-breakpoint
ALTER TABLE "schedule" ALTER COLUMN "applicationId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN "serviceName" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN "scheduleType" "scheduleType" DEFAULT 'application' NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN "composeId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN "serverId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
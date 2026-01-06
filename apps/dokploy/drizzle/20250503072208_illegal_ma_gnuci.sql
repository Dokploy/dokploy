CREATE TYPE "public"."scheduleType" AS ENUM('application', 'compose', 'server', 'dokploy-server');--> statement-breakpoint
CREATE TYPE "public"."shellType" AS ENUM('bash', 'sh');--> statement-breakpoint
CREATE TABLE "schedule" (
	"scheduleId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cronExpression" text NOT NULL,
	"appName" text NOT NULL,
	"serviceName" text,
	"shellType" "shellType" DEFAULT 'bash' NOT NULL,
	"scheduleType" "scheduleType" DEFAULT 'application' NOT NULL,
	"command" text NOT NULL,
	"script" text,
	"applicationId" text,
	"composeId" text,
	"serverId" text,
	"userId" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "startedAt" text;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "finishedAt" text;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "scheduleId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("applicationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_scheduleId_schedule_scheduleId_fk" FOREIGN KEY ("scheduleId") REFERENCES "public"."schedule"("scheduleId") ON DELETE cascade ON UPDATE no action;
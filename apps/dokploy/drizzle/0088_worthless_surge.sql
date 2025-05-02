CREATE TABLE "schedule" (
	"scheduleId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cronExpression" text NOT NULL,
	"command" text NOT NULL,
	"applicationId" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("applicationId") ON DELETE cascade ON UPDATE no action;
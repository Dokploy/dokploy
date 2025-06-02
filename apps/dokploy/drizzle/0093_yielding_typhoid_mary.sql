CREATE TABLE "rollback" (
	"rollbackId" text PRIMARY KEY NOT NULL,
	"env" text,
	"applicationId" text NOT NULL,
	"version" serial NOT NULL,
	"image" text,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "rollbackActive" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "limitRollback" integer DEFAULT 5;--> statement-breakpoint
ALTER TABLE "rollback" ADD CONSTRAINT "rollback_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("applicationId") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "rollback" (
	"rollbackId" text PRIMARY KEY NOT NULL,
	"deploymentId" text NOT NULL,
	"version" serial NOT NULL,
	"image" text,
	"createdAt" text NOT NULL,
	"fullContext" jsonb
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "rollbackActive" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "rollbackId" text;--> statement-breakpoint
ALTER TABLE "rollback" ADD CONSTRAINT "rollback_deploymentId_deployment_deploymentId_fk" FOREIGN KEY ("deploymentId") REFERENCES "public"."deployment"("deploymentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_rollbackId_rollback_rollbackId_fk" FOREIGN KEY ("rollbackId") REFERENCES "public"."rollback"("rollbackId") ON DELETE cascade ON UPDATE no action;
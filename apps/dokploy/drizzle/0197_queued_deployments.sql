ALTER TYPE "public"."deploymentStatus" ADD VALUE 'queued' BEFORE 'running';--> statement-breakpoint
ALTER TYPE "public"."applicationStatus" ADD VALUE 'queued' BEFORE 'idle';--> statement-breakpoint
CREATE TABLE "deployment_dispatch" (
	"deploymentId" text PRIMARY KEY NOT NULL,
	"job" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployment_dispatch" ADD CONSTRAINT "deployment_dispatch_deploymentId_deployment_deploymentId_fk" FOREIGN KEY ("deploymentId") REFERENCES "public"."deployment"("deploymentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployment_dispatch_created_at_idx" ON "deployment_dispatch" USING btree ("createdAt");
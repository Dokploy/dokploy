CREATE TABLE "restoration" (
	"restorationId" text PRIMARY KEY NOT NULL,
	"organizationId" text,
	"kind" text NOT NULL,
	"serviceId" text NOT NULL,
	"serviceType" text NOT NULL,
	"serviceName" text NOT NULL,
	"serviceHref" text,
	"targetName" text NOT NULL,
	"backupFile" text NOT NULL,
	"destinationName" text NOT NULL,
	"status" "deploymentStatus" DEFAULT 'running' NOT NULL,
	"createdAt" text NOT NULL,
	"finishedAt" text,
	"errorMessage" text
);
--> statement-breakpoint
ALTER TABLE "restoration" ADD CONSTRAINT "restoration_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "restoration_organization_created_idx" ON "restoration" USING btree ("organizationId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "restoration_running_target_idx" ON "restoration" USING btree (coalesce("organizationId", ''),"kind","serviceId","targetName") WHERE "restoration"."status" = 'running';

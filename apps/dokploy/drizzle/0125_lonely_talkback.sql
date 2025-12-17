CREATE TYPE "public"."migrationStatus" AS ENUM('pending', 'validating', 'pausing_source', 'backing_up', 'transferring', 'recreating', 'verifying', 'completed', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TABLE "service_migration" (
	"migrationId" text PRIMARY KEY NOT NULL,
	"serviceId" text NOT NULL,
	"serviceType" "serviceType" NOT NULL,
	"serviceName" text NOT NULL,
	"sourceServerId" text,
	"targetServerId" text NOT NULL,
	"status" "migrationStatus" DEFAULT 'pending' NOT NULL,
	"currentStep" text,
	"progress" text,
	"errorMessage" text,
	"backupPath" text,
	"volumesBackedUp" jsonb,
	"originalServerId" text,
	"originalReplicas" text,
	"startedAt" text NOT NULL,
	"completedAt" text,
	"initiatedBy" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_migration" ADD CONSTRAINT "service_migration_sourceServerId_server_serverId_fk" FOREIGN KEY ("sourceServerId") REFERENCES "public"."server"("serverId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_migration" ADD CONSTRAINT "service_migration_targetServerId_server_serverId_fk" FOREIGN KEY ("targetServerId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_migration" ADD CONSTRAINT "service_migration_initiatedBy_user_id_fk" FOREIGN KEY ("initiatedBy") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
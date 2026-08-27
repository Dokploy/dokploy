CREATE TYPE "public"."migrationStatus" AS ENUM(
	'pending',
	'validating',
	'pausing_source',
	'backing_up',
	'transferring',
	'recreating',
	'verifying',
	'completed',
	'failed',
	'rolled_back'
);

CREATE TABLE IF NOT EXISTS "service_migration" (
	"migrationId" text PRIMARY KEY NOT NULL,
	"serviceId" text NOT NULL,
	"serviceType" "public"."serviceType" NOT NULL,
	"serviceName" text NOT NULL,
	"sourceServerId" text,
	"targetServerId" text NOT NULL,
	"status" "public"."migrationStatus" DEFAULT 'pending' NOT NULL,
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

ALTER TABLE "service_migration" ADD CONSTRAINT "service_migration_sourceServerId_server_serverId_fk" FOREIGN KEY ("sourceServerId") REFERENCES "public"."server"("serverId") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "service_migration" ADD CONSTRAINT "service_migration_targetServerId_server_serverId_fk" FOREIGN KEY ("targetServerId") REFERENCES "public"."server"("serverId") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "service_migration" ADD CONSTRAINT "service_migration_initiatedBy_user_id_fk" FOREIGN KEY ("initiatedBy") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

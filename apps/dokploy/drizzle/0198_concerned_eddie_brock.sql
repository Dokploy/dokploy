CREATE TYPE "public"."objectStorageProvider" AS ENUM('minio', 'garage', 'alarik');--> statement-breakpoint
ALTER TYPE "public"."serviceType" ADD VALUE 'objectstorage';--> statement-breakpoint
CREATE TABLE "objectstorage" (
	"objectStorageId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"appName" text NOT NULL,
	"description" text,
	"provider" "objectStorageProvider" DEFAULT 'minio' NOT NULL,
	"dockerImage" text NOT NULL,
	"command" text,
	"args" text[],
	"env" text,
	"rootUser" text NOT NULL,
	"rootPassword" text NOT NULL,
	"bucket" text,
	"region" text DEFAULT 'us-east-1',
	"externalPort" integer,
	"consolePort" integer,
	"memoryReservation" text,
	"memoryLimit" text,
	"cpuReservation" text,
	"cpuLimit" text,
	"applicationStatus" "applicationStatus" DEFAULT 'idle' NOT NULL,
	"healthCheckSwarm" json,
	"restartPolicySwarm" json,
	"placementSwarm" json,
	"updateConfigSwarm" json,
	"rollbackConfigSwarm" json,
	"modeSwarm" json,
	"labelsSwarm" json,
	"networkSwarm" json,
	"stopGracePeriodSwarm" bigint,
	"endpointSpecSwarm" json,
	"ulimitsSwarm" json,
	"replicas" integer DEFAULT 1 NOT NULL,
	"createdAt" text NOT NULL,
	"environmentId" text NOT NULL,
	"serverId" text,
	"networkIds" text[] DEFAULT '{}',
	"detachDokployNetwork" boolean DEFAULT false NOT NULL,
	CONSTRAINT "objectstorage_appName_unique" UNIQUE("appName")
);
--> statement-breakpoint
ALTER TABLE "mount" ADD COLUMN "objectStorageId" text;--> statement-breakpoint
ALTER TABLE "objectstorage" ADD CONSTRAINT "objectstorage_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectstorage" ADD CONSTRAINT "objectstorage_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mount" ADD CONSTRAINT "mount_objectStorageId_objectstorage_objectStorageId_fk" FOREIGN KEY ("objectStorageId") REFERENCES "public"."objectstorage"("objectStorageId") ON DELETE cascade ON UPDATE no action;
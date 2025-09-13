CREATE TYPE "public"."sqldNode" AS ENUM('primary', 'replica');--> statement-breakpoint
CREATE TABLE "libsql" (
	"libsqlId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"appName" text NOT NULL,
	"description" text,
	"databaseUser" text NOT NULL,
	"databasePassword" text NOT NULL,
	"sqldNode" "sqldNode" DEFAULT 'primary' NOT NULL,
	"sqldPrimaryUrl" text,
	"enableNamespaces" boolean DEFAULT false NOT NULL,
	"dockerImage" text NOT NULL,
	"command" text,
	"env" text,
	"memoryReservation" text,
	"memoryLimit" text,
	"cpuReservation" text,
	"cpuLimit" text,
	"externalPort" integer,
	"externalGRPCPort" integer,
	"externalAdminPort" integer,
	"applicationStatus" "applicationStatus" DEFAULT 'idle' NOT NULL,
	"healthCheckSwarm" json,
	"restartPolicySwarm" json,
	"placementSwarm" json,
	"updateConfigSwarm" json,
	"rollbackConfigSwarm" json,
	"modeSwarm" json,
	"labelsSwarm" json,
	"networkSwarm" json,
	"replicas" integer DEFAULT 1 NOT NULL,
	"createdAt" text NOT NULL,
	"environmentId" text NOT NULL,
	"serverId" text,
	CONSTRAINT "libsql_appName_unique" UNIQUE("appName")
);
--> statement-breakpoint
ALTER TABLE "mount" ADD COLUMN "libsqlId" text;--> statement-breakpoint
ALTER TABLE "volume_backup" ADD COLUMN "libsqlId" text;--> statement-breakpoint
ALTER TABLE "libsql" ADD CONSTRAINT "libsql_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "libsql" ADD CONSTRAINT "libsql_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mount" ADD CONSTRAINT "mount_libsqlId_libsql_libsqlId_fk" FOREIGN KEY ("libsqlId") REFERENCES "public"."libsql"("libsqlId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_backup" ADD CONSTRAINT "volume_backup_libsqlId_libsql_libsqlId_fk" FOREIGN KEY ("libsqlId") REFERENCES "public"."libsql"("libsqlId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."mount" ALTER COLUMN "serviceType" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."volume_backup" ALTER COLUMN "serviceType" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."serviceType";--> statement-breakpoint
CREATE TYPE "public"."serviceType" AS ENUM('application', 'compose', 'libsql', 'mariadb', 'mongo', 'mysql', 'postgres', 'redis');--> statement-breakpoint
ALTER TABLE "public"."mount" ALTER COLUMN "serviceType" SET DATA TYPE "public"."serviceType" USING "serviceType"::"public"."serviceType";--> statement-breakpoint
ALTER TABLE "public"."volume_backup" ALTER COLUMN "serviceType" SET DATA TYPE "public"."serviceType" USING "serviceType"::"public"."serviceType";
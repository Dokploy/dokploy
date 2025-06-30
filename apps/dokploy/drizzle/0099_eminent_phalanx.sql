CREATE TYPE "public"."volumeBackupType" AS ENUM('bind', 'volume');--> statement-breakpoint
CREATE TABLE "volume_backup" (
	"volumeBackupId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "volumeBackupType" DEFAULT 'volume' NOT NULL,
	"volumeName" text,
	"hostPath" text,
	"prefix" text NOT NULL,
	"serviceType" "serviceType" DEFAULT 'application' NOT NULL,
	"schedule" text NOT NULL,
	"keepLatestCount" integer,
	"applicationId" text,
	"postgresId" text,
	"mariadbId" text,
	"mongoId" text,
	"mysqlId" text,
	"redisId" text,
	"composeId" text,
	"createdAt" text NOT NULL,
	"destinationId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "volume_backup" ADD CONSTRAINT "volume_backup_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("applicationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_backup" ADD CONSTRAINT "volume_backup_postgresId_postgres_postgresId_fk" FOREIGN KEY ("postgresId") REFERENCES "public"."postgres"("postgresId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_backup" ADD CONSTRAINT "volume_backup_mariadbId_mariadb_mariadbId_fk" FOREIGN KEY ("mariadbId") REFERENCES "public"."mariadb"("mariadbId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_backup" ADD CONSTRAINT "volume_backup_mongoId_mongo_mongoId_fk" FOREIGN KEY ("mongoId") REFERENCES "public"."mongo"("mongoId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_backup" ADD CONSTRAINT "volume_backup_mysqlId_mysql_mysqlId_fk" FOREIGN KEY ("mysqlId") REFERENCES "public"."mysql"("mysqlId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_backup" ADD CONSTRAINT "volume_backup_redisId_redis_redisId_fk" FOREIGN KEY ("redisId") REFERENCES "public"."redis"("redisId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_backup" ADD CONSTRAINT "volume_backup_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_backup" ADD CONSTRAINT "volume_backup_destinationId_destination_destinationId_fk" FOREIGN KEY ("destinationId") REFERENCES "public"."destination"("destinationId") ON DELETE cascade ON UPDATE no action;
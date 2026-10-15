-- Enable scheduled commands for database containers.
ALTER TYPE "public"."scheduleType" ADD VALUE 'postgres';--> statement-breakpoint
ALTER TYPE "public"."scheduleType" ADD VALUE 'mysql';--> statement-breakpoint
ALTER TYPE "public"."scheduleType" ADD VALUE 'mariadb';--> statement-breakpoint
ALTER TYPE "public"."scheduleType" ADD VALUE 'mongo';--> statement-breakpoint
ALTER TYPE "public"."scheduleType" ADD VALUE 'redis';--> statement-breakpoint
ALTER TYPE "public"."scheduleType" ADD VALUE 'libsql';--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN "postgresId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN "mysqlId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN "mariadbId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN "mongoId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN "redisId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN "libsqlId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_postgresId_postgres_postgresId_fk" FOREIGN KEY ("postgresId") REFERENCES "public"."postgres"("postgresId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_mysqlId_mysql_mysqlId_fk" FOREIGN KEY ("mysqlId") REFERENCES "public"."mysql"("mysqlId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_mariadbId_mariadb_mariadbId_fk" FOREIGN KEY ("mariadbId") REFERENCES "public"."mariadb"("mariadbId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_mongoId_mongo_mongoId_fk" FOREIGN KEY ("mongoId") REFERENCES "public"."mongo"("mongoId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_redisId_redis_redisId_fk" FOREIGN KEY ("redisId") REFERENCES "public"."redis"("redisId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_libsqlId_libsql_libsqlId_fk" FOREIGN KEY ("libsqlId") REFERENCES "public"."libsql"("libsqlId") ON DELETE cascade ON UPDATE no action;

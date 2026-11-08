-- Keep this migration safe for databases that already ran the original
-- 0198_database_scheduled_jobs.sql from the database-schedule branch.
-- Enable scheduled commands for database containers.
ALTER TYPE "public"."scheduleType" ADD VALUE IF NOT EXISTS 'postgres';--> statement-breakpoint
ALTER TYPE "public"."scheduleType" ADD VALUE IF NOT EXISTS 'mysql';--> statement-breakpoint
ALTER TYPE "public"."scheduleType" ADD VALUE IF NOT EXISTS 'mariadb';--> statement-breakpoint
ALTER TYPE "public"."scheduleType" ADD VALUE IF NOT EXISTS 'mongo';--> statement-breakpoint
ALTER TYPE "public"."scheduleType" ADD VALUE IF NOT EXISTS 'redis';--> statement-breakpoint
ALTER TYPE "public"."scheduleType" ADD VALUE IF NOT EXISTS 'libsql';--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN IF NOT EXISTS "postgresId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN IF NOT EXISTS "mysqlId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN IF NOT EXISTS "mariadbId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN IF NOT EXISTS "mongoId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN IF NOT EXISTS "redisId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN IF NOT EXISTS "libsqlId" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schedule'::regclass
      AND conname = 'schedule_postgresId_postgres_postgresId_fk'
  ) THEN
    ALTER TABLE "schedule" ADD CONSTRAINT "schedule_postgresId_postgres_postgresId_fk" FOREIGN KEY ("postgresId") REFERENCES "public"."postgres"("postgresId") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schedule'::regclass
      AND conname = 'schedule_mysqlId_mysql_mysqlId_fk'
  ) THEN
    ALTER TABLE "schedule" ADD CONSTRAINT "schedule_mysqlId_mysql_mysqlId_fk" FOREIGN KEY ("mysqlId") REFERENCES "public"."mysql"("mysqlId") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schedule'::regclass
      AND conname = 'schedule_mariadbId_mariadb_mariadbId_fk'
  ) THEN
    ALTER TABLE "schedule" ADD CONSTRAINT "schedule_mariadbId_mariadb_mariadbId_fk" FOREIGN KEY ("mariadbId") REFERENCES "public"."mariadb"("mariadbId") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schedule'::regclass
      AND conname = 'schedule_mongoId_mongo_mongoId_fk'
  ) THEN
    ALTER TABLE "schedule" ADD CONSTRAINT "schedule_mongoId_mongo_mongoId_fk" FOREIGN KEY ("mongoId") REFERENCES "public"."mongo"("mongoId") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schedule'::regclass
      AND conname = 'schedule_redisId_redis_redisId_fk'
  ) THEN
    ALTER TABLE "schedule" ADD CONSTRAINT "schedule_redisId_redis_redisId_fk" FOREIGN KEY ("redisId") REFERENCES "public"."redis"("redisId") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schedule'::regclass
      AND conname = 'schedule_libsqlId_libsql_libsqlId_fk'
  ) THEN
    ALTER TABLE "schedule" ADD CONSTRAINT "schedule_libsqlId_libsql_libsqlId_fk" FOREIGN KEY ("libsqlId") REFERENCES "public"."libsql"("libsqlId") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
-- Step 1: Add environmentId columns as nullable first
ALTER TABLE "application" ADD COLUMN "environmentId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "environmentId" text;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "environmentId" text;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "environmentId" text;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "environmentId" text;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "environmentId" text;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "environmentId" text;--> statement-breakpoint

-- Step 2: Create production environment for each project that doesn't have one
-- INSERT INTO "environment" ("environmentId", "name", "description", "createdAt", "projectId")
-- SELECT 
--     'env_prod_' || p."projectId" || '_' || EXTRACT(EPOCH FROM NOW())::text,
--     'production',
--     'Production environment',
--     NOW()::text,
--     p."projectId"
-- FROM "project" p
-- WHERE NOT EXISTS (
--     SELECT 1 FROM "environment" e 
--     WHERE e."projectId" = p."projectId" AND e."name" = 'production'
-- );--> statement-breakpoint

-- Step 3: Update all services to point to their project's production environment
-- Update applications
UPDATE "application" 
SET "environmentId" = (
    SELECT e."environmentId" 
    FROM "environment" e 
    WHERE e."projectId" = "application"."projectId" 
    AND e."name" = 'production'
    LIMIT 1
);--> statement-breakpoint

-- Update compose
UPDATE "compose" 
SET "environmentId" = (
    SELECT e."environmentId" 
    FROM "environment" e 
    WHERE e."projectId" = "compose"."projectId" 
    AND e."name" = 'production'
    LIMIT 1
);--> statement-breakpoint

-- Update mariadb
UPDATE "mariadb" 
SET "environmentId" = (
    SELECT e."environmentId" 
    FROM "environment" e 
    WHERE e."projectId" = "mariadb"."projectId" 
    AND e."name" = 'production'
    LIMIT 1
);--> statement-breakpoint

-- Update mongo
UPDATE "mongo" 
SET "environmentId" = (
    SELECT e."environmentId" 
    FROM "environment" e 
    WHERE e."projectId" = "mongo"."projectId" 
    AND e."name" = 'production'
    LIMIT 1
);--> statement-breakpoint

-- Update mysql
UPDATE "mysql" 
SET "environmentId" = (
    SELECT e."environmentId" 
    FROM "environment" e 
    WHERE e."projectId" = "mysql"."projectId" 
    AND e."name" = 'production'
    LIMIT 1
);--> statement-breakpoint

-- Update postgres
UPDATE "postgres" 
SET "environmentId" = (
    SELECT e."environmentId" 
    FROM "environment" e 
    WHERE e."projectId" = "postgres"."projectId" 
    AND e."name" = 'production'
    LIMIT 1
);--> statement-breakpoint

-- Update redis
UPDATE "redis" 
SET "environmentId" = (
    SELECT e."environmentId" 
    FROM "environment" e 
    WHERE e."projectId" = "redis"."projectId" 
    AND e."name" = 'production'
    LIMIT 1
);--> statement-breakpoint

-- Step 4: Make environmentId columns NOT NULL
ALTER TABLE "application" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "compose" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mariadb" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mongo" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mysql" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "postgres" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "redis" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint

-- Step 5: Add foreign key constraints
ALTER TABLE "application" ADD CONSTRAINT "application_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compose" ADD CONSTRAINT "compose_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mariadb" ADD CONSTRAINT "mariadb_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mongo" ADD CONSTRAINT "mongo_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mysql" ADD CONSTRAINT "mysql_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postgres" ADD CONSTRAINT "postgres_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redis" ADD CONSTRAINT "redis_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;
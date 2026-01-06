CREATE TABLE "environment" (
	"environmentId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"createdAt" text NOT NULL,
	"projectId" text NOT NULL
);
ALTER TABLE "environment" ADD CONSTRAINT "environment_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "public"."project"("projectId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Insertar un ambiente "production" para cada proyecto existente
INSERT INTO "environment" ("environmentId", "name", "description", "createdAt", "projectId")
SELECT 
    -- Generar un ID único para cada ambiente usando el projectId como base
    'env_prod_' || "projectId" || '_' || EXTRACT(EPOCH FROM NOW())::text,
    'production',
    'Production environment',
    NOW()::text,
    "projectId"
FROM "project"
WHERE "projectId" NOT IN (
    SELECT DISTINCT "projectId" 
    FROM "environment" 
    WHERE "name" = 'production'
);

ALTER TABLE "application" ADD COLUMN "environmentId" text;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "environmentId" text;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "environmentId" text;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "environmentId" text;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "environmentId" text;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "environmentId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "environmentId" text;--> statement-breakpoint


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


--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT "application_projectId_project_projectId_fk";
--> statement-breakpoint
ALTER TABLE "postgres" DROP CONSTRAINT "postgres_projectId_project_projectId_fk";
--> statement-breakpoint
ALTER TABLE "mariadb" DROP CONSTRAINT "mariadb_projectId_project_projectId_fk";
--> statement-breakpoint
ALTER TABLE "mongo" DROP CONSTRAINT "mongo_projectId_project_projectId_fk";
--> statement-breakpoint
ALTER TABLE "mysql" DROP CONSTRAINT "mysql_projectId_project_projectId_fk";
--> statement-breakpoint
ALTER TABLE "redis" DROP CONSTRAINT "redis_projectId_project_projectId_fk";
--> statement-breakpoint
ALTER TABLE "compose" DROP CONSTRAINT "compose_projectId_project_projectId_fk";
--> statement-breakpoint

-- Step 4: Make environmentId columns NOT NULL
ALTER TABLE "application" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "compose" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mariadb" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mongo" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mysql" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "postgres" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "redis" ALTER COLUMN "environmentId" SET NOT NULL;--> statement-breakpoint



ALTER TABLE "application" ADD CONSTRAINT "application_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postgres" ADD CONSTRAINT "postgres_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mariadb" ADD CONSTRAINT "mariadb_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mongo" ADD CONSTRAINT "mongo_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mysql" ADD CONSTRAINT "mysql_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redis" ADD CONSTRAINT "redis_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compose" ADD CONSTRAINT "compose_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" DROP COLUMN "projectId";--> statement-breakpoint
ALTER TABLE "postgres" DROP COLUMN "projectId";--> statement-breakpoint
ALTER TABLE "mariadb" DROP COLUMN "projectId";--> statement-breakpoint
ALTER TABLE "mongo" DROP COLUMN "projectId";--> statement-breakpoint
ALTER TABLE "mysql" DROP COLUMN "projectId";--> statement-breakpoint
ALTER TABLE "redis" DROP COLUMN "projectId";--> statement-breakpoint
ALTER TABLE "compose" DROP COLUMN "projectId";
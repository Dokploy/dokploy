CREATE TABLE "environment" (
	"environmentId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"createdAt" text NOT NULL,
	"projectId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "public"."project"("projectId") ON DELETE cascade ON UPDATE no action;


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
-- Custom SQL migration file, put your code below! --
-- Primero, actualizamos los proyectos con la organización del usuario
UPDATE "project" p
SET "organizationId" = (
    SELECT m."organization_id"
    FROM "member" m
    WHERE m."user_id" = p."userId"
    AND m."role" = 'owner'
    LIMIT 1
)
WHERE p."organizationId" IS NULL;

-- Verificamos que todos los proyectos tengan una organización
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "project"
        WHERE "organizationId" IS NULL
    ) THEN
        RAISE EXCEPTION 'Hay proyectos sin organización asignada';
    END IF;
END $$;

-- Hacemos organization_id NOT NULL después de la migración
ALTER TABLE "project" 
    ALTER COLUMN "organizationId" SET NOT NULL;
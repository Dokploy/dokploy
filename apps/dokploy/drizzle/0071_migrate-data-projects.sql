-- Custom SQL migration file

-- Actualizar projects
UPDATE "project" p
SET "organizationId" = (
    SELECT m."organization_id"
    FROM "member" m
    WHERE m."user_id" = p."userId"
    AND m."role" = 'owner'
    LIMIT 1
)
WHERE p."organizationId" IS NULL;

-- Actualizar servers
UPDATE "server" s
SET "organizationId" = (
    SELECT m."organization_id"
    FROM "member" m
    WHERE m."user_id" = s."userId"
    AND m."role" = 'owner'
    LIMIT 1
)
WHERE s."organizationId" IS NULL;

-- Actualizar ssh-keys
UPDATE "ssh-key" k
SET "organizationId" = (
    SELECT m."organization_id"
    FROM "member" m
    WHERE m."user_id" = k."userId"
    AND m."role" = 'owner'
    LIMIT 1
)
WHERE k."organizationId" IS NULL;

-- Actualizar destinations
UPDATE "destination" d
SET "organizationId" = (
    SELECT m."organization_id"
    FROM "member" m
    WHERE m."user_id" = d."userId"
    AND m."role" = 'owner'
    LIMIT 1
)
WHERE d."organizationId" IS NULL;

-- Actualizar registry
UPDATE "registry" r
SET "organizationId" = (
    SELECT m."organization_id"
    FROM "member" m
    WHERE m."user_id" = r."userId"
    AND m."role" = 'owner'
    LIMIT 1
)
WHERE r."organizationId" IS NULL;

-- Actualizar notifications
UPDATE "notification" n
SET "organizationId" = (
    SELECT m."organization_id"
    FROM "member" m
    WHERE m."user_id" = n."userId"
    AND m."role" = 'owner'
    LIMIT 1
)
WHERE n."organizationId" IS NULL;

-- Actualizar certificates
UPDATE "certificate" c
SET "organizationId" = (
    SELECT m."organization_id"
    FROM "member" m
    WHERE m."user_id" = c."userId"
    AND m."role" = 'owner'
    LIMIT 1
)
WHERE c."organizationId" IS NULL;

-- Actualizar git_provider
UPDATE "git_provider" g
SET "organizationId" = (
    SELECT m."organization_id"
    FROM "member" m
    WHERE m."user_id" = g."userId"
    AND m."role" = 'owner'
    LIMIT 1
)
WHERE g."organizationId" IS NULL;

-- Verificar que todos los recursos tengan una organización
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "project" WHERE "organizationId" IS NULL
        UNION ALL
        SELECT 1 FROM "server" WHERE "organizationId" IS NULL
        UNION ALL
        SELECT 1 FROM "ssh-key" WHERE "organizationId" IS NULL
        UNION ALL
        SELECT 1 FROM "destination" WHERE "organizationId" IS NULL
        UNION ALL
        SELECT 1 FROM "registry" WHERE "organizationId" IS NULL
        UNION ALL
        SELECT 1 FROM "notification" WHERE "organizationId" IS NULL
        UNION ALL
        SELECT 1 FROM "certificate" WHERE "organizationId" IS NULL
        UNION ALL
        SELECT 1 FROM "git_provider" WHERE "organizationId" IS NULL
    ) THEN
        RAISE EXCEPTION 'Hay recursos sin organización asignada';
    END IF;
END $$;

-- Hacer organization_id NOT NULL en todas las tablas
ALTER TABLE "project" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "server" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ssh-key" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "destination" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "registry" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "notification" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "certificate" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "git_provider" ALTER COLUMN "organizationId" SET NOT NULL;

-- Crear índices para mejorar el rendimiento de búsquedas por organización
CREATE INDEX IF NOT EXISTS "idx_project_organization" ON "project" ("organizationId");
CREATE INDEX IF NOT EXISTS "idx_server_organization" ON "server" ("organizationId");
CREATE INDEX IF NOT EXISTS "idx_sshkey_organization" ON "ssh-key" ("organizationId");
CREATE INDEX IF NOT EXISTS "idx_destination_organization" ON "destination" ("organizationId");
CREATE INDEX IF NOT EXISTS "idx_registry_organization" ON "registry" ("organizationId");
CREATE INDEX IF NOT EXISTS "idx_notification_organization" ON "notification" ("organizationId");
CREATE INDEX IF NOT EXISTS "idx_certificate_organization" ON "certificate" ("organizationId");
CREATE INDEX IF NOT EXISTS "idx_git_provider_organization" ON "git_provider" ("organizationId");










CREATE TABLE "account" (
    "id" text PRIMARY KEY NOT NULL,
    "account_id" text NOT NULL,
    "provider_id" text NOT NULL,
    "user_id" text NOT NULL,
    "access_token" text,
    "refresh_token" text,
    "id_token" text,
    "access_token_expires_at" timestamp,
    "refresh_token_expires_at" timestamp,
    "scope" text,
    "password" text,
    "is2FAEnabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp NOT NULL,
    "updated_at" timestamp NOT NULL,
    "resetPasswordToken" text,
    "resetPasswordExpiresAt" text,
    "confirmationToken" text,
    "confirmationExpiresAt" text
);

--> statement-breakpoint
CREATE TABLE "verification" (
    "id" text PRIMARY KEY NOT NULL,
    "identifier" text NOT NULL,
    "value" text NOT NULL,
    "expires_at" timestamp NOT NULL,
    "created_at" timestamp,
    "updated_at" timestamp
);

-- Primero eliminar las restricciones NOT NULL y foreign keys
ALTER TABLE "user" ALTER COLUMN "adminId" DROP NOT NULL;
ALTER TABLE "user" ALTER COLUMN "authId" DROP NOT NULL;

ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_adminId_admin_adminId_fk";
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_authId_auth_id_fk";
ALTER TABLE "admin" DROP CONSTRAINT IF EXISTS "admin_authId_auth_id_fk";
ALTER TABLE "project" DROP CONSTRAINT IF EXISTS "project_adminId_admin_adminId_fk";
ALTER TABLE "destination" DROP CONSTRAINT IF EXISTS "destination_adminId_admin_adminId_fk";
ALTER TABLE "certificate" DROP CONSTRAINT IF EXISTS "certificate_adminId_admin_adminId_fk";
ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_user_id_auth_id_fk";
ALTER TABLE "registry" DROP CONSTRAINT IF EXISTS "registry_adminId_admin_adminId_fk";
ALTER TABLE "notification" DROP CONSTRAINT IF EXISTS "notification_adminId_admin_adminId_fk";
ALTER TABLE "ssh-key" DROP CONSTRAINT IF EXISTS "ssh-key_adminId_admin_adminId_fk";
ALTER TABLE "git_provider" DROP CONSTRAINT IF EXISTS "git_provider_adminId_admin_adminId_fk";
ALTER TABLE "server" DROP CONSTRAINT IF EXISTS "server_adminId_admin_adminId_fk";

-- Luego renombrar las columnas
ALTER TABLE "user" RENAME COLUMN "userId" TO "id";
ALTER TABLE "project" RENAME COLUMN "adminId" TO "userId";
ALTER TABLE "destination" RENAME COLUMN "adminId" TO "userId";
ALTER TABLE "certificate" RENAME COLUMN "adminId" TO "userId";
ALTER TABLE "registry" RENAME COLUMN "adminId" TO "userId";
ALTER TABLE "notification" RENAME COLUMN "adminId" TO "userId";
ALTER TABLE "ssh-key" RENAME COLUMN "adminId" TO "userId";
ALTER TABLE "git_provider" RENAME COLUMN "adminId" TO "userId";
ALTER TABLE "server" RENAME COLUMN "adminId" TO "userId";

-- Primero agregar todas las columnas sin restricciones
ALTER TABLE "user" ADD COLUMN "name" text;
ALTER TABLE "user" ADD COLUMN "email" text;
ALTER TABLE "user" ADD COLUMN "email_verified" boolean;
ALTER TABLE "user" ADD COLUMN "image" text;
ALTER TABLE "user" ADD COLUMN "role" text;
ALTER TABLE "user" ADD COLUMN "banned" boolean;
ALTER TABLE "user" ADD COLUMN "ban_reason" text;
ALTER TABLE "user" ADD COLUMN "ban_expires" timestamp;
ALTER TABLE "user" ADD COLUMN "updated_at" timestamp;
ALTER TABLE "user" ADD COLUMN "serverIp" text;
ALTER TABLE "user" ADD COLUMN "certificateType" "certificateType" DEFAULT 'none';
ALTER TABLE "user" ADD COLUMN "host" text;
ALTER TABLE "user" ADD COLUMN "letsEncryptEmail" text;
ALTER TABLE "user" ADD COLUMN "sshPrivateKey" text;
ALTER TABLE "user" ADD COLUMN "enableDockerCleanup" boolean DEFAULT false;
ALTER TABLE "user" ADD COLUMN "enableLogRotation" boolean DEFAULT false;
ALTER TABLE "user" ADD COLUMN "enablePaidFeatures" boolean DEFAULT false;
ALTER TABLE "user" ADD COLUMN "metricsConfig" jsonb DEFAULT '{"server":{"type":"Dokploy","refreshRate":60,"port":4500,"token":"","retentionDays":2,"cronJob":"","urlCallback":"","thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":60,"services":{"include":[],"exclude":[]}}}';
ALTER TABLE "user" ADD COLUMN "cleanupCacheApplications" boolean DEFAULT false;
ALTER TABLE "user" ADD COLUMN "cleanupCacheOnPreviews" boolean DEFAULT false;
ALTER TABLE "user" ADD COLUMN "cleanupCacheOnCompose" boolean DEFAULT false;

ALTER TABLE "user" ALTER COLUMN "token" SET DEFAULT '';
ALTER TABLE "user" ALTER COLUMN "expirationDate" SET DEFAULT CURRENT_TIMESTAMP + INTERVAL '1 year';
ALTER TABLE "user" ALTER COLUMN "createdAt" SET DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

--> statement-breakpoint
-- Luego actualizar los valores nulos
UPDATE "user" SET token = '' WHERE token IS NULL;
UPDATE "user" SET "expirationDate" = CURRENT_TIMESTAMP + INTERVAL '1 year' WHERE "expirationDate" IS NULL;
UPDATE "user" SET "createdAt" = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE "createdAt" IS NULL;
UPDATE "user" SET "name" = '' WHERE "name" IS NULL;
-- Generar emails únicos para registros vacíos
UPDATE "user" SET "email" = CONCAT('user_', id, '@dokploy.local') WHERE "email" = '' OR "email" IS NULL;
UPDATE "user" SET "email_verified" = COALESCE("email_verified", false) WHERE true;
UPDATE "user" SET "role" = COALESCE("role", 'user') WHERE true;
UPDATE "user" SET "banned" = COALESCE("banned", false) WHERE true;
UPDATE "user" SET "updated_at" = COALESCE("updated_at", CURRENT_TIMESTAMP) WHERE true;
UPDATE "user" SET "certificateType" = COALESCE("certificateType", 'none') WHERE true;
UPDATE "user" SET "enableDockerCleanup" = COALESCE("enableDockerCleanup", false) WHERE true;
UPDATE "user" SET "enableLogRotation" = COALESCE("enableLogRotation", false) WHERE true;
UPDATE "user" SET "enablePaidFeatures" = COALESCE("enablePaidFeatures", false) WHERE true;
UPDATE "user" SET "metricsConfig" = COALESCE("metricsConfig", '{"server":{"type":"Dokploy","refreshRate":60,"port":4500,"token":"","retentionDays":2,"cronJob":"","urlCallback":"","thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":60,"services":{"include":[],"exclude":[]}}}') WHERE true;
UPDATE "user" SET "cleanupCacheApplications" = COALESCE("cleanupCacheApplications", false) WHERE true;
UPDATE "user" SET "cleanupCacheOnPreviews" = COALESCE("cleanupCacheOnPreviews", false) WHERE true;
UPDATE "user" SET "cleanupCacheOnCompose" = COALESCE("cleanupCacheOnCompose", false) WHERE true;
--> statement-breakpoint

-- Migrar datos de auth a user
INSERT INTO "user" (
    id,
    name,
    email,
    email_verified,
    image,
    role,
    updated_at
)
SELECT 
    id,
    '' as name,
    email,
    true as email_verified,
    image,
    CASE 
        WHEN rol = 'admin' THEN 'admin'
        ELSE 'user'
    END as role,
    CAST("createdAt" AS timestamp) as updated_at
FROM "auth";

-- Migrar datos de auth a account
INSERT INTO "account" (
    id,
    account_id,
    provider_id,
    user_id,
    password,
    "is2FAEnabled",
    created_at,
    updated_at
)
SELECT 
    id as id,
    id as account_id,
    'credentials' as provider_id,
    id as user_id,
    password,
    "is2FAEnabled",
    CAST("createdAt" AS timestamp) as created_at,
    CAST("createdAt" AS timestamp) as updated_at
FROM "auth";

-- Migrar datos de admin a user
UPDATE "user" u
SET 
    "serverIp" = a."serverIp",
    "certificateType" = a."certificateType",
    "host" = a."host",
    "letsEncryptEmail" = a."letsEncryptEmail",
    "sshPrivateKey" = a."sshPrivateKey",
    "enableDockerCleanup" = a."enableDockerCleanup",
    "enableLogRotation" = a."enableLogRotation",
    "enablePaidFeatures" = a."enablePaidFeatures",
    "metricsConfig" = a."metricsConfig",
    "cleanupCacheApplications" = a."cleanupCacheApplications",
    "cleanupCacheOnPreviews" = a."cleanupCacheOnPreviews",
    "cleanupCacheOnCompose" = a."cleanupCacheOnCompose"
FROM "admin" a
WHERE u.id = a."authId";

-- Actualizar referencias en las tablas relacionadas
UPDATE "project" p
SET "userId" = a."authId"
FROM "admin" a
WHERE p."userId" = a."adminId";

UPDATE "destination" d
SET "userId" = a."authId"
FROM "admin" a
WHERE d."userId" = a."adminId";

UPDATE "certificate" c
SET "userId" = a."authId"
FROM "admin" a
WHERE c."userId" = a."adminId";

UPDATE "registry" r
SET "userId" = a."authId"
FROM "admin" a
WHERE r."userId" = a."adminId";

UPDATE "notification" n
SET "userId" = a."authId"
FROM "admin" a
WHERE n."userId" = a."adminId";

UPDATE "ssh-key" s
SET "userId" = a."authId"
FROM "admin" a
WHERE s."userId" = a."adminId";

UPDATE "git_provider" g
SET "userId" = a."authId"
FROM "admin" a
WHERE g."userId" = a."adminId";

UPDATE "server" s
SET "userId" = a."authId"
FROM "admin" a
WHERE s."userId" = a."adminId";

-- Ahora agregar las restricciones NOT NULL después de migrar los datos
ALTER TABLE "user" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "email_verified" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "updated_at" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "certificateType" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "enableDockerCleanup" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "enableLogRotation" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "enablePaidFeatures" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "metricsConfig" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "cleanupCacheApplications" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "cleanupCacheOnPreviews" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "cleanupCacheOnCompose" SET NOT NULL;

-- Modificar session
ALTER TABLE "session" ALTER COLUMN "expires_at" SET DATA TYPE timestamp;
ALTER TABLE "session" ADD COLUMN "token" text;
ALTER TABLE "session" ADD COLUMN "created_at" timestamp;
ALTER TABLE "session" ADD COLUMN "updated_at" timestamp;
ALTER TABLE "session" ADD COLUMN "ip_address" text;
ALTER TABLE "session" ADD COLUMN "user_agent" text;
ALTER TABLE "session" ADD COLUMN "impersonated_by" text;

-- Agregar nuevas restricciones después de migrar todos los datos
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "project" ADD CONSTRAINT "project_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "destination" ADD CONSTRAINT "destination_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "registry" ADD CONSTRAINT "registry_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ssh-key" ADD CONSTRAINT "ssh-key_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "server" ADD CONSTRAINT "server_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

-- Agregar restricciones únicas
ALTER TABLE "user" ADD CONSTRAINT "user_email_unique" UNIQUE("email");
ALTER TABLE "session" ADD CONSTRAINT "session_token_unique" UNIQUE("token");

-- Eliminar columnas antiguas
ALTER TABLE "user" DROP COLUMN IF EXISTS "adminId";
ALTER TABLE "user" DROP COLUMN IF EXISTS "authId";

-- Eliminar columnas de admin
ALTER TABLE "admin" DROP COLUMN IF EXISTS "adminId";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "serverIp";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "certificateType";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "host";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "letsEncryptEmail";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "sshPrivateKey";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "enableDockerCleanup";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "enableLogRotation";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "authId";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "createdAt";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "stripeCustomerId";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "stripeSubscriptionId";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "serversQuantity";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "enablePaidFeatures";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "metricsConfig";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "cleanupCacheApplications";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "cleanupCacheOnPreviews";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "cleanupCacheOnCompose";

-- Eliminar tablas antiguas
DROP TABLE IF EXISTS "auth" CASCADE;
DROP TABLE IF EXISTS "admin" CASCADE;

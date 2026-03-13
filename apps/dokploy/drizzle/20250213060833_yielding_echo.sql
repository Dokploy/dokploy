CREATE TABLE "user_temp" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"isRegistered" boolean DEFAULT false NOT NULL,
	"expirationDate" text NOT NULL,
	"createdAt" text NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp,
	"updated_at" timestamp NOT NULL,
	"serverIp" text,
	"certificateType" "certificateType" DEFAULT 'none' NOT NULL,
	"host" text,
	"letsEncryptEmail" text,
	"sshPrivateKey" text,
	"enableDockerCleanup" boolean DEFAULT false NOT NULL,
	"enableLogRotation" boolean DEFAULT false NOT NULL,
	"enablePaidFeatures" boolean DEFAULT false NOT NULL,
	"metricsConfig" jsonb DEFAULT '{"server":{"type":"Dokploy","refreshRate":60,"port":4500,"token":"","retentionDays":2,"cronJob":"","urlCallback":"","thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":60,"services":{"include":[],"exclude":[]}}}'::jsonb NOT NULL,
	"cleanupCacheApplications" boolean DEFAULT false NOT NULL,
	"cleanupCacheOnPreviews" boolean DEFAULT false NOT NULL,
	"cleanupCacheOnCompose" boolean DEFAULT false NOT NULL,
	"stripeCustomerId" text,
	"stripeSubscriptionId" text,
	"serversQuantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_temp_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "session_temp" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	"active_organization_id" text,
	CONSTRAINT "session_temp_token_unique" UNIQUE("token")
);
--> statement-breakpoint
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
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"inviter_id" text NOT NULL,
	"team_id" text
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"canCreateProjects" boolean DEFAULT false NOT NULL,
	"canAccessToSSHKeys" boolean DEFAULT false NOT NULL,
	"canCreateServices" boolean DEFAULT false NOT NULL,
	"canDeleteProjects" boolean DEFAULT false NOT NULL,
	"canDeleteServices" boolean DEFAULT false NOT NULL,
	"canAccessToDocker" boolean DEFAULT false NOT NULL,
	"canAccessToAPI" boolean DEFAULT false NOT NULL,
	"canAccessToGitProviders" boolean DEFAULT false NOT NULL,
	"canAccessToTraefikFiles" boolean DEFAULT false NOT NULL,
	"accesedProjects" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"accesedServices" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"team_id" text
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	"owner_id" text NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
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

CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL
);

CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean,
	"rate_limit_enabled" boolean,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
DELETE FROM "certificate" WHERE "adminId" IS NULL;
DELETE FROM "notification" WHERE "adminId" IS NULL;
DELETE FROM "ssh-key" WHERE "adminId" IS NULL;
DELETE FROM "git_provider" WHERE "adminId" IS NULL;

ALTER TABLE "certificate" ALTER COLUMN "adminId" SET NOT NULL ;--> statement-breakpoint
ALTER TABLE "notification" ALTER COLUMN "adminId" SET NOT NULL ;--> statement-breakpoint
ALTER TABLE "ssh-key" ALTER COLUMN "adminId" SET NOT NULL ;--> statement-breakpoint
ALTER TABLE "git_provider" ALTER COLUMN "adminId" SET NOT NULL ;--> statement-breakpoint
ALTER TABLE "session_temp" ADD CONSTRAINT "session_temp_user_id_user_temp_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_temp"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_temp_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_temp"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_temp_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user_temp"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_temp_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_temp"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_owner_id_user_temp_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_temp"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_temp_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_user_temp_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint


-- Data Migration

-- Custom SQL migration file, put your code below! --

WITH inserted_users AS (
    -- Insertar usuarios desde admins
    INSERT INTO user_temp (
        id,
        email,
        "email_verified",
        "updated_at",
        "serverIp",
        image,
        "certificateType",
        host,
        "letsEncryptEmail",
        "sshPrivateKey",
        "enableDockerCleanup",
        "enableLogRotation",
        "enablePaidFeatures",
        "metricsConfig",
        "cleanupCacheApplications",
        "cleanupCacheOnPreviews",
        "cleanupCacheOnCompose",
        "stripeCustomerId",
        "stripeSubscriptionId",
        "serversQuantity",
        "expirationDate",
        "createdAt",
        "isRegistered"
    )
    SELECT 
        a."adminId",
        auth.email,
        true,
        CURRENT_TIMESTAMP,
        a."serverIp",
        auth.image,
        a."certificateType",
        a.host,
        a."letsEncryptEmail",
        a."sshPrivateKey",
        a."enableDockerCleanup",
        a."enableLogRotation",
        a."enablePaidFeatures",
        a."metricsConfig",
        a."cleanupCacheApplications",
        a."cleanupCacheOnPreviews",
        a."cleanupCacheOnCompose",
        a."stripeCustomerId",
        a."stripeSubscriptionId",
        a."serversQuantity",
        NOW() + INTERVAL '1 year',
        NOW(),
        true
    FROM admin a
    JOIN auth ON auth.id = a."authId"
    RETURNING *
),
inserted_accounts AS (
    -- Insertar cuentas para los admins
    INSERT INTO account (
        id,
        "account_id",
        "provider_id",
        "user_id",
        password,
        "created_at",
        "updated_at"
    )
    SELECT 
        gen_random_uuid(),
        gen_random_uuid(),
        'credential',
        a."adminId",
        auth.password,
        NOW(),
        NOW()
    FROM admin a
    JOIN auth ON auth.id = a."authId"
    RETURNING *
),
inserted_orgs AS (
    -- Crear organizaciones para cada admin
    INSERT INTO organization (
        id,
        name,
        slug,
        "owner_id",
        "created_at"
    )
    SELECT 
        gen_random_uuid(),
        'My Organization',
        -- Generamos un slug único usando una función de hash
        encode(sha256((a."adminId" || CURRENT_TIMESTAMP)::bytea), 'hex'),
        a."adminId",
        NOW()
    FROM admin a
    RETURNING *
),
inserted_members AS (
    -- Insertar usuarios miembros
    INSERT INTO user_temp (
        id,
        email,
        "email_verified",
        "updated_at",
        image,
        "createdAt",
        "expirationDate",
        "isRegistered"
    )
    SELECT 
        u."userId",
        auth.email,
        true,
        CURRENT_TIMESTAMP,
        auth.image,
        NOW(),
        NOW() + INTERVAL '1 year',
        COALESCE(u."isRegistered", false)
    FROM "user" u
    JOIN admin a ON u."adminId" = a."adminId"
    JOIN auth ON auth.id = u."authId"
    RETURNING *
),
inserted_member_accounts AS (
    -- Insertar cuentas para los usuarios miembros
    INSERT INTO account (
        id,
        "account_id",
        "provider_id",
        "user_id",
        password,
        "created_at",
        "updated_at"
    )
    SELECT 
        gen_random_uuid(),
        gen_random_uuid(),
        'credential',
        u."userId",
        auth.password,
        NOW(),
        NOW()
    FROM "user" u
    JOIN admin a ON u."adminId" = a."adminId"
    JOIN auth ON auth.id = u."authId"
    RETURNING *
),
inserted_admin_members AS (
    -- Insertar miembros en las organizaciones (admins como owners)
    INSERT INTO member (
        id,
        "organization_id",
        "user_id",
        role,
        "created_at",
        "canAccessToAPI",
        "canAccessToDocker",
        "canAccessToGitProviders",
        "canAccessToSSHKeys",
        "canAccessToTraefikFiles",
        "canCreateProjects",
        "canCreateServices",
        "canDeleteProjects",
        "canDeleteServices",
        "accesedProjects",
        "accesedServices"
    )
    SELECT 
        gen_random_uuid(),
        o.id,
        a."adminId",
        'owner',
        NOW(),
        true, -- Los admins tienen todos los permisos por defecto
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        '{}',
        '{}'
    FROM admin a
    JOIN inserted_orgs o ON o."owner_id" = a."adminId"
    JOIN auth ON auth.id = a."authId"
    RETURNING *
)
-- Insertar miembros regulares en las organizaciones
INSERT INTO member (
    id,
    "organization_id",
    "user_id",
    role,
    "created_at",
    "canAccessToAPI",
    "canAccessToDocker",
    "canAccessToGitProviders",
    "canAccessToSSHKeys",
    "canAccessToTraefikFiles",
    "canCreateProjects",
    "canCreateServices",
    "canDeleteProjects",
    "canDeleteServices",
    "accesedProjects",
    "accesedServices"
)
SELECT 
    gen_random_uuid(),
    o.id,
    u."userId",
    'member',
    NOW(),
    COALESCE(u."canAccessToAPI", false),
    COALESCE(u."canAccessToDocker", false),
    COALESCE(u."canAccessToGitProviders", false),
    COALESCE(u."canAccessToSSHKeys", false),
    COALESCE(u."canAccessToTraefikFiles", false),
    COALESCE(u."canCreateProjects", false),
    COALESCE(u."canCreateServices", false),
    COALESCE(u."canDeleteProjects", false),
    COALESCE(u."canDeleteServices", false),
    COALESCE(u."accesedProjects", '{}'),
    COALESCE(u."accesedServices", '{}')
FROM "user" u
JOIN admin a ON u."adminId" = a."adminId"
JOIN inserted_orgs o ON o."owner_id" = a."adminId"
JOIN auth ON auth.id = u."authId";

-- Migrar tokens de auth a apikey
INSERT INTO apikey (
    id,
    name,
    key,
    user_id,
    enabled,
    created_at,
    updated_at
)
SELECT 
    gen_random_uuid(),
    'Legacy Token',
    auth.token,
user_temp.id,
    true,
    NOW(),
    NOW()
FROM auth
JOIN admin ON auth.id = admin."authId"
JOIN user_temp ON user_temp.id = admin."adminId"
WHERE auth.token IS NOT NULL AND auth.token != '';

-- Migration tables foreign keys 

ALTER TABLE "project" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "destination" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "certificate" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "registry" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "notification" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "ssh-key" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "git_provider" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "server" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT "project_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "destination" DROP CONSTRAINT "destination_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "certificate" DROP CONSTRAINT "certificate_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "registry" DROP CONSTRAINT "registry_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "ssh-key" DROP CONSTRAINT "ssh-key_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "git_provider" DROP CONSTRAINT "git_provider_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "server" DROP CONSTRAINT "server_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination" ADD CONSTRAINT "destination_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry" ADD CONSTRAINT "registry_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh-key" ADD CONSTRAINT "ssh-key_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;


ALTER TABLE "user_temp" ADD COLUMN "created_at" timestamp DEFAULT now();


-- Add properties

ALTER TABLE "project" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "certificate" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "registry" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "ssh-key" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "git_provider" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination" ADD CONSTRAINT "destination_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry" ADD CONSTRAINT "registry_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh-key" ADD CONSTRAINT "ssh-key_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;


-- Update tables to use organizationId

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





-- Botar tablas de migración
ALTER TABLE "project" DROP CONSTRAINT "project_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "destination" DROP CONSTRAINT "destination_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "certificate" DROP CONSTRAINT "certificate_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "registry" DROP CONSTRAINT "registry_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "ssh-key" DROP CONSTRAINT "ssh-key_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "git_provider" DROP CONSTRAINT "git_provider_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "server" DROP CONSTRAINT "server_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "certificate" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "registry" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ssh-key" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "git_provider" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "destination" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "certificate" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "registry" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "notification" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "ssh-key" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "git_provider" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "server" DROP COLUMN "userId";

-- Drop tables
DROP TABLE "user" CASCADE;--> statement-breakpoint
DROP TABLE "admin" CASCADE;--> statement-breakpoint
DROP TABLE "auth" CASCADE;--> statement-breakpoint
DROP TABLE "session" CASCADE;--> statement-breakpoint
DROP TYPE "public"."Roles";


-- Drop tables
ALTER TABLE "account" DROP CONSTRAINT "account_user_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "invitation" DROP CONSTRAINT "invitation_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "invitation" DROP CONSTRAINT "invitation_inviter_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "member" DROP CONSTRAINT "member_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "member" DROP CONSTRAINT "member_user_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_owner_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_temp_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_temp_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_temp_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_owner_id_user_temp_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;


-- Update references

ALTER TABLE "session_temp" DROP CONSTRAINT "session_temp_user_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "session_temp" ADD CONSTRAINT "session_temp_user_id_user_temp_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;
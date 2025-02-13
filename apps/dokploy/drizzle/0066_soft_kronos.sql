-- Create new tables
CREATE TABLE IF NOT EXISTS "account" (
    "id" text PRIMARY KEY NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("userId"),
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp,
    "refreshTokenExpiresAt" timestamp,
    "scope" text,
    "password" text,
    "is2FAEnabled" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp NOT NULL,
    "updatedAt" timestamp NOT NULL,
    "resetPasswordToken" text,
    "resetPasswordExpiresAt" text,
    "confirmationToken" text,
    "confirmationExpiresAt" text
);

CREATE TABLE IF NOT EXISTS "organization" (
    "id" text PRIMARY KEY NOT NULL,mn cj.  
    "name" text NOT NULL,
    "slug" text,
    "logo" text,
    "createdAt" timestamp NOT NULL,
    "metadata" text,
    "ownerId" text NOT NULL REFERENCES "user"("userId"),
    CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "member" (
    "id" text PRIMARY KEY NOT NULL,
    "organizationId" text NOT NULL REFERENCES "organization"("id"),
    "userId" text NOT NULL REFERENCES "user"("userId"),
    "role" text NOT NULL,
    "createdAt" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "invitation" (
    "id" text PRIMARY KEY NOT NULL,
    "organizationId" text NOT NULL,
    "email" text NOT NULL,
    "role" text,
    "status" text NOT NULL,
    "expiresAt" timestamp NOT NULL,
    "inviterId" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
    "id" text PRIMARY KEY NOT NULL,
    "identifier" text NOT NULL,
    "value" text NOT NULL,
    "expiresAt" timestamp NOT NULL,
    "createdAt" timestamp,
    "updatedAt" timestamp
);

-- Alter existing user table to add new columns
ALTER TABLE "user" 
ADD COLUMN IF NOT EXISTS "email" text,
ADD COLUMN IF NOT EXISTS "emailVerified" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "role" text,
ADD COLUMN IF NOT EXISTS "certificateType" text DEFAULT 'none',
ADD COLUMN IF NOT EXISTS "serverIp" text,
ADD COLUMN IF NOT EXISTS "host" text,
ADD COLUMN IF NOT EXISTS "letsEncryptEmail" text,
ADD COLUMN IF NOT EXISTS "sshPrivateKey" text,
ADD COLUMN IF NOT EXISTS "enableDockerCleanup" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "enableLogRotation" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "enablePaidFeatures" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "metricsConfig" jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "cleanupCacheApplications" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "cleanupCacheOnPreviews" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "cleanupCacheOnCompose" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "stripeCustomerId" text,
ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" text,
ADD COLUMN IF NOT EXISTS "serversQuantity" integer DEFAULT 0;

-- Migrate email from auth table to user table
UPDATE "user" u
SET "email" = a."email"
FROM "auth" a
WHERE a."id" = u."userId";

-- Migrate admin users
WITH admin_users AS (
    UPDATE "user" u
    SET 
        "emailVerified" = true,
        "role" = 'admin',
        "token" = a."token",
        "certificateType" = adm."certificateType",
        "serverIp" = adm."serverIp",
        "host" = adm."host",
        "letsEncryptEmail" = adm."letsEncryptEmail",
        "sshPrivateKey" = adm."sshPrivateKey",
        "enableDockerCleanup" = adm."enableDockerCleanup",
        "enableLogRotation" = adm."enableLogRotation",
        "enablePaidFeatures" = adm."enablePaidFeatures",
        "metricsConfig" = adm."metricsConfig",
        "cleanupCacheApplications" = adm."cleanupCacheApplications",
        "cleanupCacheOnPreviews" = adm."cleanupCacheOnPreviews",
        "cleanupCacheOnCompose" = adm."cleanupCacheOnCompose",
        "stripeCustomerId" = adm."stripeCustomerId",
        "stripeSubscriptionId" = adm."stripeSubscriptionId",
        "serversQuantity" = adm."serversQuantity"
    FROM "auth" a
    INNER JOIN "admin" adm ON a."id" = adm."adminId"
    WHERE a."id" = u."userId"
    RETURNING u."userId", u."email"
)
INSERT INTO "account" ("id", "accountId", "providerId", "password", "userId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    a."id",
    'credentials',
    a."password",
    au."userId",
    NOW(),
    NOW()
FROM "auth" a
INNER JOIN admin_users au ON a."email" = au."email";

-- Create organizations for admin users
WITH admin_orgs AS (
    INSERT INTO "organization" ("id", "name", "slug", "createdAt", "ownerId")
    SELECT 
        gen_random_uuid(),
        'My Organization',
        concat('org/', u."userId"),
        NOW(),
        u."userId"
    FROM "user" u
    WHERE u."role" = 'admin'
    RETURNING *
)
-- Migrate regular users
UPDATE "user" u
SET 
    "emailVerified" = true,
    "role" = 'user',
    "token" = a."token",
    "canCreateProjects" = usr."canCreateProjects",
    "canAccessToSSHKeys" = usr."canAccessToSSHKeys"
FROM "auth" a
INNER JOIN "user" usr ON a."id" = usr."userId"
WHERE a."id" = u."userId"
AND NOT EXISTS (
    SELECT 1 FROM "admin" adm WHERE a."id" = adm."adminId"
);

-- Create accounts for regular users
INSERT INTO "account" ("id", "accountId", "providerId", "password", "userId", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    a."id",
    'credentials',
    a."password",
    u."userId",
    NOW(),
    NOW()
FROM "auth" a
INNER JOIN "user" u ON a."email" = u."email"
WHERE u."role" = 'user';

-- Create member relationships
INSERT INTO "member" ("id", "organizationId", "role", "userId", "createdAt")
SELECT 
    gen_random_uuid(),
    o."id",
    'user',
    u."userId",
    NOW()
FROM "user" usr
INNER JOIN "user" u ON usr."userId" = u."userId"
INNER JOIN "admin" adm ON usr."adminId" = adm."adminId"
INNER JOIN "user" admin_u ON adm."adminId" = admin_u."userId"
INNER JOIN "organization" o ON o."ownerId" = admin_u."userId"
WHERE u."role" = 'user';

-- Drop old tables (after all data is migrated)
DROP TABLE IF EXISTS "sessionTable" CASCADE;
DROP TABLE IF EXISTS "admin" CASCADE;
DROP TABLE IF EXISTS "auth" CASCADE;
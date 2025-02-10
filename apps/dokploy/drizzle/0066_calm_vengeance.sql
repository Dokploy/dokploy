-- Primero ejecutar todas las modificaciones estructurales
ALTER TABLE "user" RENAME COLUMN "userId" TO "id";
--> statement-breakpoint
ALTER TABLE "project" RENAME COLUMN "adminId" TO "userId";
--> statement-breakpoint
ALTER TABLE "destination" RENAME COLUMN "adminId" TO "userId";
--> statement-breakpoint
ALTER TABLE "certificate" RENAME COLUMN "adminId" TO "userId";
--> statement-breakpoint
ALTER TABLE "registry" RENAME COLUMN "adminId" TO "userId";
--> statement-breakpoint
ALTER TABLE "notification" RENAME COLUMN "adminId" TO "userId";
--> statement-breakpoint
ALTER TABLE "ssh-key" RENAME COLUMN "adminId" TO "userId";
--> statement-breakpoint
ALTER TABLE "git_provider" RENAME COLUMN "adminId" TO "userId";
--> statement-breakpoint
ALTER TABLE "server" RENAME COLUMN "adminId" TO "userId";
--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_authId_auth_id_fk";
--> statement-breakpoint
ALTER TABLE "admin" DROP CONSTRAINT "admin_authId_auth_id_fk";
--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT "project_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "destination" DROP CONSTRAINT "destination_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "certificate" DROP CONSTRAINT "certificate_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT "session_user_id_auth_id_fk";
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
ALTER TABLE "user" ALTER COLUMN "expirationDate" SET DATA TYPE text;
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "expires_at" SET DATA TYPE timestamp;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_verified" boolean NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "image" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "banned" boolean;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_reason" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_expires" timestamp;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "updated_at" timestamp NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "serverIp" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "certificateType" "certificateType" DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "host" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "letsEncryptEmail" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "sshPrivateKey" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "enableDockerCleanup" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "enableLogRotation" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "enablePaidFeatures" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "metricsConfig" jsonb DEFAULT '{"server":{"type":"Dokploy","refreshRate":60,"port":4500,"token":"","retentionDays":2,"cronJob":"","urlCallback":"","thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":60,"services":{"include":[],"exclude":[]}}}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "cleanupCacheApplications" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "cleanupCacheOnPreviews" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "cleanupCacheOnCompose" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "stripeCustomerId" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "stripeSubscriptionId" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "serversQuantity" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "token" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "created_at" timestamp NOT NULL;
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "updated_at" timestamp NOT NULL;
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "ip_address" text;
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "user_agent" text;
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "impersonated_by" text;
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_organization_id" text;
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
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp NOT NULL
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
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "destination" ADD CONSTRAINT "destination_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "registry" ADD CONSTRAINT "registry_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ssh-key" ADD CONSTRAINT "ssh-key_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "adminId";
--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "authId";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "adminId";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "serverIp";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "certificateType";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "host";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "letsEncryptEmail";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "sshPrivateKey";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "enableDockerCleanup";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "enableLogRotation";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "authId";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "createdAt";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "stripeCustomerId";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "stripeSubscriptionId";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "serversQuantity";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "enablePaidFeatures";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "metricsConfig";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "cleanupCacheApplications";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "cleanupCacheOnPreviews";
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN "cleanupCacheOnCompose";
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_email_unique" UNIQUE("email");
--> statement-breakpoint

-- Primero quitar NOT NULL temporalmente
ALTER TABLE "session" ALTER COLUMN "token" DROP NOT NULL;
--> statement-breakpoint

-- Actualizar tokens existentes
UPDATE "session" SET 
  token = gen_random_uuid(),
  created_at = COALESCE(created_at, NOW() - interval '1 day'),
  updated_at = NOW()
WHERE token IS NULL;

-- Restablecer restricciones
ALTER TABLE "session" ALTER COLUMN "token" SET NOT NULL;
ALTER TABLE "session" ADD CONSTRAINT "session_token_unique" UNIQUE (token);

-- Luego realizar la migración de datos
-- Migración de datos para Admins
WITH admin_users AS (
  INSERT INTO "user" (
    id, created_at, token, email, email_verified, role, updated_at,
    certificate_type, server_ip, host, lets_encrypt_email, ssh_private_key,
    enable_docker_cleanup, enable_log_rotation, enable_paid_features,
    metrics_config, cleanup_cache_applications, cleanup_cache_on_previews,
    cleanup_cache_on_compose, stripe_customer_id, stripe_subscription_id,
    servers_quantity
  )
  SELECT 
    gen_random_uuid(),
    a.created_at,
    a.token,
    a.email,
    true,
    'admin',
    a.created_at,
    ad.certificate_type,
    ad.server_ip,
    ad.host,
    ad.lets_encrypt_email,
    ad.ssh_private_key,
    ad.enable_docker_cleanup,
    ad.enable_log_rotation,
    ad.enable_paid_features,
    ad.metrics_config,
    ad.cleanup_cache_applications,
    ad.cleanup_cache_on_previews,
    ad.cleanup_cache_on_compose,
    ad.stripe_customer_id,
    ad.stripe_subscription_id,
    ad.servers_quantity
  FROM auth a
  JOIN admins ad ON a.id = ad.auth_id
  RETURNING id AS user_id, created_at, email
)
INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT
  gen_random_uuid(),
  a.id,
  'credentials',
  au.user_id,
  a.password,
  au.created_at,
  au.created_at
FROM auth a
JOIN admin_users au ON a.email = au.email;

-- Crear organizaciones para admins
WITH admin_orgs AS (
  INSERT INTO organization (id, name, slug, created_at, owner_id)
  SELECT
    gen_random_uuid(),
    'My Organization',
    'org/' || au.user_id,
    au.created_at,
    au.user_id
  FROM admin_users au
  RETURNING id AS org_id, owner_id
)
-- Migrar usuarios regulares y asociar a organizaciones
INSERT INTO "user" (
  id, created_at, token, email, email_verified, role, updated_at,
  can_create_projects, can_access_ssh_keys
)
SELECT
  gen_random_uuid(),
  a.created_at,
  a.token,
  a.email,
  true,
  'user',
  a.created_at,
  u.can_create_projects,
  u.can_access_ssh_keys
FROM auth a
JOIN users u ON a.id = u.auth_id
WHERE a.role = 'user';

-- Crear accounts para usuarios
INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT
  gen_random_uuid(),
  a.id,
  'credentials',
  u.id,
  a.password,
  a.created_at,
  a.created_at
FROM auth a
JOIN "user" u ON a.email = u.email;

-- Asociar usuarios a organizaciones de sus admins
INSERT INTO member (id, organization_id, user_id, role, created_at)
SELECT
  gen_random_uuid(),
  ao.org_id,
  u.id,
  'user',
  u.created_at
FROM "user" u
JOIN users old_u ON u.email = old_u.email
JOIN auth a ON old_u.auth_id = a.id
JOIN admin_orgs ao ON ao.owner_id = a.id;

-- Eliminar tablas obsoletas
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS auth;
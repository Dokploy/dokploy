CREATE TABLE "member_role" (
	"roleId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"canDelete" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false,
	"permissions" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"organizationId" text NOT NULL,
	CONSTRAINT "member_role_name_unique" UNIQUE("name"),
	CONSTRAINT "role_name_unique" UNIQUE("name","organizationId")
);

-- Create default roles for each organization
DO $$
DECLARE
    org RECORD;
BEGIN
    FOR org IN SELECT id FROM "organization"
    LOOP
        -- Insert owner role
        INSERT INTO "member_role" ("roleId", "name", "description", "canDelete", "is_system", "permissions", "created_at", "updated_at", "organizationId")
        VALUES (
            org.id || '_owner',
            'owner',
            'Owner role with full access',
            false,
            true,
            '{"project:create", "project:delete", "service:create", "service:delete", "traefik_files:access", "docker:view", "api:access", "ssh_keys:access", "git_providers:access", "schedules:access"}',
            NOW(),
            NOW(),
            org.id
        );

        -- Insert admin role
        INSERT INTO "member_role" ("roleId", "name", "description", "canDelete", "is_system", "permissions", "created_at", "updated_at", "organizationId")
        VALUES (
            org.id || '_admin',
            'admin',
            'Administrator role with elevated access',
            false,
            true,
            '{"project:create", "project:delete", "service:create", "service:delete", "traefik_files:access", "docker:view", "api:access", "ssh_keys:access", "schedules:access"}',
            NOW(),
            NOW(),
            org.id
        );

        -- Insert member role
        INSERT INTO "member_role" ("roleId", "name", "description", "canDelete", "is_system", "permissions", "created_at", "updated_at", "organizationId")
        VALUES (
            org.id || '_member',
            'member',
            'Standard member role',
            false,
            true,
            '{"project:create", "service:create", "docker:view"}',
            NOW(),
            NOW(),
            org.id
        );
    END LOOP;
END $$;



--> statement-breakpoint
ALTER TABLE "user_temp" RENAME TO "users";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "user_temp_email_unique";--> statement-breakpoint
ALTER TABLE "backup" DROP CONSTRAINT "backup_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "session_temp" DROP CONSTRAINT "session_temp_user_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "git_provider" DROP CONSTRAINT "git_provider_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT "account_user_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "apikey" DROP CONSTRAINT "apikey_user_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "invitation" DROP CONSTRAINT "invitation_inviter_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "member" DROP CONSTRAINT "member_user_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_owner_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "two_factor" DROP CONSTRAINT "two_factor_user_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "schedule" DROP CONSTRAINT "schedule_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "roleId" text;--> statement-breakpoint
ALTER TABLE "member_role" ADD CONSTRAINT "member_role_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup" ADD CONSTRAINT "backup_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_temp" ADD CONSTRAINT "session_temp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_roleId_member_role_roleId_fk" FOREIGN KEY ("roleId") REFERENCES "public"."member_role"("roleId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Update existing members with corresponding roles based on their current role type
DO $$
DECLARE
    mem RECORD;
BEGIN
    FOR mem IN SELECT m.id, m.organization_id, m.role as role_type FROM "member" m
    LOOP
        UPDATE "member"
        SET "roleId" = mem.organization_id || '_' || mem.role_type
        WHERE id = mem.id;
    END LOOP;
END $$;
ALTER TABLE "member" ALTER COLUMN "roleId" SET NOT NULL;


ALTER TABLE "organization" ADD CONSTRAINT "organization_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

--> statement-breakpoint
CREATE TABLE "web_server" (
	"webServerId" text PRIMARY KEY NOT NULL,
	"serverIp" text,
	"certificateType" "certificateType" DEFAULT 'none' NOT NULL,
	"https" boolean DEFAULT false NOT NULL,
	"host" text,
	"letsEncryptEmail" text,
	"sshPrivateKey" text,
	"enableDockerCleanup" boolean DEFAULT false NOT NULL,
	"logCleanupCron" text DEFAULT '0 0 * * *',
	"metricsConfig" jsonb DEFAULT '{"server":{"type":"Dokploy","refreshRate":60,"port":4500,"token":"","retentionDays":2,"cronJob":"","urlCallback":"","thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":60,"services":{"include":[],"exclude":[]}}}'::jsonb NOT NULL
);

INSERT INTO "web_server" (
	"webServerId", 
	"serverIp", 
	"certificateType", 
	"https", 
	"host", 
	"letsEncryptEmail", 
	"sshPrivateKey", 
	"enableDockerCleanup", 
	"logCleanupCron", 
	"metricsConfig"
)
SELECT 
	gen_random_uuid() as "webServerId",
	u."serverIp",
	COALESCE(u."certificateType", 'none') as "certificateType",
	COALESCE(u."https", false) as "https",
	u."host",
	u."letsEncryptEmail",
	u."sshPrivateKey",
	COALESCE(u."enableDockerCleanup", false) as "enableDockerCleanup",
	COALESCE(u."logCleanupCron", '0 0 * * *') as "logCleanupCron",
	COALESCE(u."metricsConfig", '{"server":{"type":"Dokploy","refreshRate":60,"port":4500,"token":"","retentionDays":2,"cronJob":"","urlCallback":"","thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":60,"services":{"include":[],"exclude":[]}}}') as "metricsConfig"
FROM "users" u
INNER JOIN "organization" o ON u.id = o.owner_id
LIMIT 1;


ALTER TABLE "users" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "serverIp";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "certificateType";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "https";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "host";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "letsEncryptEmail";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "sshPrivateKey";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "enableDockerCleanup";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "logCleanupCron";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "metricsConfig";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "cleanupCacheApplications";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "cleanupCacheOnPreviews";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "cleanupCacheOnCompose";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "canCreateProjects";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "canAccessToSSHKeys";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "canCreateServices";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "canDeleteProjects";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "canDeleteServices";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "canAccessToDocker";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "canAccessToAPI";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "canAccessToGitProviders";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "canAccessToTraefikFiles";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
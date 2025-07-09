CREATE TABLE "organization_role" (
	"roleId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"canDelete" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false,
	"permissions" text[],
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"organizationId" text NOT NULL
);

-- Create default roles for each organization
DO $$
DECLARE
    org RECORD;
BEGIN
    FOR org IN SELECT id FROM "organization"
    LOOP
        -- Insert owner role
        INSERT INTO "organization_role" ("roleId", "name", "description", "canDelete", "is_system", "permissions", "created_at", "updated_at", "organizationId")
        VALUES (
            org.id || '_owner',
            'owner',
            'Owner role with full access',
            false,
            true,
            '{"project:create", "project:delete", "service:create", "service:delete", "traefik_files:access", "docker:view", "api:access", "ssh_keys:access", "git_providers:access"}',
            NOW(),
            NOW(),
            org.id
        );

        -- Insert admin role
        INSERT INTO "organization_role" ("roleId", "name", "description", "canDelete", "is_system", "permissions", "created_at", "updated_at", "organizationId")
        VALUES (
            org.id || '_admin',
            'admin',
            'Administrator role with elevated access',
            false,
            true,
            '{"project:create", "project:delete", "service:create", "service:delete", "traefik_files:access", "docker:view", "api:access", "ssh_keys:access"}',
            NOW(),
            NOW(),
            org.id
        );

        -- Insert member role
        INSERT INTO "organization_role" ("roleId", "name", "description", "canDelete", "is_system", "permissions", "created_at", "updated_at", "organizationId")
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
ALTER TABLE "member" ADD COLUMN "roleId" text;
--> statement-breakpoint
ALTER TABLE "organization_role" ADD CONSTRAINT "organization_role_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_roleId_organization_role_roleId_fk" FOREIGN KEY ("roleId") REFERENCES "public"."organization_role"("roleId") ON DELETE cascade ON UPDATE no action;

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
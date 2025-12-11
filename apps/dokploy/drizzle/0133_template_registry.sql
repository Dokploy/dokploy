CREATE TABLE IF NOT EXISTS "template_registry" (
	"templateRegistryId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"baseUrl" text NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"isEnabled" boolean DEFAULT true NOT NULL,
	"lastSyncAt" text,
	"templateCount" text,
	"createdAt" text NOT NULL,
	"organizationId" text NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "template_registry" ADD CONSTRAINT "template_registry_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;


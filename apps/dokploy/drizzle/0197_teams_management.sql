ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"max_members" integer,
	"accessed_servers" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_organizationId_idx" ON "team" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_name_idx" ON "team" USING btree ("organization_id","name");

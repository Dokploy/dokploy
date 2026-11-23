ALTER TABLE "organization_role" ADD COLUMN "allowed_domains" text[];--> statement-breakpoint
ALTER TABLE "organization_role" ADD COLUMN "require_https" boolean DEFAULT false NOT NULL;
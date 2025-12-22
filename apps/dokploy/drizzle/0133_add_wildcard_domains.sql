ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "wildcardDomain" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "wildcardDomain" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "useOrganizationWildcard" boolean DEFAULT true NOT NULL;

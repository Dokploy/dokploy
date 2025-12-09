ALTER TABLE "organization" ADD COLUMN "wildcardDomain" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "wildcardDomain" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "useOrganizationWildcard" boolean DEFAULT true NOT NULL;
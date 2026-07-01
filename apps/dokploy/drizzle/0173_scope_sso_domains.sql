ALTER TABLE "sso_provider" ADD COLUMN "domainVerified" boolean DEFAULT false;--> statement-breakpoint
UPDATE "sso_provider" SET "domainVerified" = true WHERE NULLIF(btrim("domain"), '') IS NOT NULL;--> statement-breakpoint

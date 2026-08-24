ALTER TABLE "cloud_provider_credentials" ALTER COLUMN "provider" TYPE text USING "provider"::text;--> statement-breakpoint
DROP TYPE "public"."cloudProvider";--> statement-breakpoint

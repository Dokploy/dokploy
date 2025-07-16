ALTER TYPE "public"."sourceType" ADD VALUE 'registry';--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "deployRegistryId" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "deployImage" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "deployImageTag" text DEFAULT 'latest';--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_deployRegistryId_registry_registryId_fk" FOREIGN KEY ("deployRegistryId") REFERENCES "public"."registry"("registryId") ON DELETE set null ON UPDATE no action;
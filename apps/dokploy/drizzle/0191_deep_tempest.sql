ALTER TABLE "application" ADD COLUMN "previewDockerImage" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "previewRegistryId" text;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_previewRegistryId_registry_registryId_fk" FOREIGN KEY ("previewRegistryId") REFERENCES "public"."registry"("registryId") ON DELETE set null ON UPDATE no action;
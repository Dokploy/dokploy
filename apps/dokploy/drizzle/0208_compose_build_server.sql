-- Per-compose build server: two nullable columns on "compose" (build server and
-- the registry the built images are pushed to). Guarded (IF NOT EXISTS /
-- duplicate_object) so a re-run after an upstream-to-fork switch is a no-op.
ALTER TABLE "compose" ADD COLUMN IF NOT EXISTS "buildServerId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN IF NOT EXISTS "buildRegistryId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compose" ADD CONSTRAINT "compose_buildServerId_server_serverId_fk" FOREIGN KEY ("buildServerId") REFERENCES "public"."server"("serverId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compose" ADD CONSTRAINT "compose_buildRegistryId_registry_registryId_fk" FOREIGN KEY ("buildRegistryId") REFERENCES "public"."registry"("registryId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

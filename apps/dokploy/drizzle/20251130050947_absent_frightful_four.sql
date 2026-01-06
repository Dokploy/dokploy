CREATE TYPE "public"."serverType" AS ENUM('deploy', 'build');--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "buildServerId" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "buildRegistryId" text;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "buildServerId" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "serverType" "serverType" DEFAULT 'deploy' NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_buildServerId_server_serverId_fk" FOREIGN KEY ("buildServerId") REFERENCES "public"."server"("serverId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_buildRegistryId_registry_registryId_fk" FOREIGN KEY ("buildRegistryId") REFERENCES "public"."registry"("registryId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_buildServerId_server_serverId_fk" FOREIGN KEY ("buildServerId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
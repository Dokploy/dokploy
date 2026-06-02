ALTER TABLE "forward_auth_settings" DROP CONSTRAINT "forward_auth_settings_organizationId_serverId_unique";--> statement-breakpoint
ALTER TABLE "forward_auth_settings" DROP CONSTRAINT "forward_auth_settings_organizationId_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "forward_auth_settings" DROP COLUMN "organizationId";--> statement-breakpoint
ALTER TABLE "forward_auth_settings" ADD CONSTRAINT "forward_auth_settings_serverId_unique" UNIQUE("serverId");
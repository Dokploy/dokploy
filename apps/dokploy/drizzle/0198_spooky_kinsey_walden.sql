CREATE TYPE "public"."cloudServerStatus" AS ENUM('pending', 'provisioning', 'configuring', 'ready', 'upgrading', 'error', 'suspended', 'terminating');--> statement-breakpoint
CREATE TABLE "cloud_server" (
	"cloudServerId" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"serverId" text,
	"plan" text NOT NULL,
	"status" "cloudServerStatus" DEFAULT 'pending' NOT NULL,
	"providerVmId" text,
	"providerNetworkId" text,
	"providerFirewallId" text,
	"zone" text NOT NULL,
	"sshKeyId" text,
	"ipAddress" text,
	"hostname" text,
	"stripeSubscriptionId" text,
	"stripeCheckoutSessionId" text,
	"suspendedAt" text,
	"errorMessage" text,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webServerSettings" ALTER COLUMN "whitelabelingConfig" SET DEFAULT '{"appName":null,"appDescription":null,"logoUrl":null,"faviconUrl":null,"customCss":null,"loginLogoUrl":null,"supportUrl":null,"docsUrl":null,"errorPageTitle":null,"errorPageDescription":null,"footerText":null,"ogImageUrl":null,"logoLightUrl":null,"loginLogoLightUrl":null,"faviconLightUrl":null,"dualModeBranding":false}'::jsonb;--> statement-breakpoint
ALTER TABLE "cloud_server" ADD CONSTRAINT "cloud_server_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_server" ADD CONSTRAINT "cloud_server_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_server" ADD CONSTRAINT "cloud_server_sshKeyId_ssh-key_sshKeyId_fk" FOREIGN KEY ("sshKeyId") REFERENCES "public"."ssh-key"("sshKeyId") ON DELETE set null ON UPDATE no action;
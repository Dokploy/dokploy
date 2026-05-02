CREATE TYPE "public"."cloudflareSyncStatus" AS ENUM('pending', 'synced', 'conflict', 'error');--> statement-breakpoint
CREATE TYPE "public"."tunnelStatus" AS ENUM('disabled', 'provisioning', 'installing', 'registering', 'healthy', 'error');--> statement-breakpoint
CREATE TABLE "cloudflare_config" (
	"cloudflareConfigId" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"apiToken" text NOT NULL,
	"accountId" text NOT NULL,
	"accountName" text,
	"tokenScopes" text[],
	"verifiedAt" text,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloudflare_zone" (
	"cloudflareZoneId" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"cloudflareConfigId" text NOT NULL,
	"zoneId" text NOT NULL,
	"zoneName" text NOT NULL,
	"accountId" text NOT NULL,
	"status" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "cloudflareZoneId" text;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "cloudflareRecordId" text;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "cloudflareSyncStatus" "cloudflareSyncStatus";--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "cloudflareSyncedAt" text;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "cloudflareSyncError" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "tunnelStatus" "tunnelStatus" DEFAULT 'disabled' NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "tunnelId" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "tunnelToken" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "tunnelError" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "tunnelCheckedAt" text;--> statement-breakpoint
ALTER TABLE "cloudflare_config" ADD CONSTRAINT "cloudflare_config_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloudflare_zone" ADD CONSTRAINT "cloudflare_zone_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloudflare_zone" ADD CONSTRAINT "cloudflare_zone_cloudflareConfigId_cloudflare_config_cloudflareConfigId_fk" FOREIGN KEY ("cloudflareConfigId") REFERENCES "public"."cloudflare_config"("cloudflareConfigId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cloudflare_config_organizationId_unique" ON "cloudflare_config" USING btree ("organizationId");--> statement-breakpoint
CREATE UNIQUE INDEX "cloudflare_zone_org_zoneId_unique" ON "cloudflare_zone" USING btree ("organizationId","zoneId");--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_cloudflareZoneId_cloudflare_zone_cloudflareZoneId_fk" FOREIGN KEY ("cloudflareZoneId") REFERENCES "public"."cloudflare_zone"("cloudflareZoneId") ON DELETE set null ON UPDATE no action;
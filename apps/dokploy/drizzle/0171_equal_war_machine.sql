CREATE TYPE "public"."cloudflareTunnelRuntimeMode" AS ENUM('shared-managed');--> statement-breakpoint
CREATE TYPE "public"."cloudflareTunnelRuntimeStatus" AS ENUM('pending', 'running', 'error', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."cloudflareTunnelMode" AS ENUM('existing-instance', 'shared-managed');--> statement-breakpoint
CREATE TABLE "cloudflare_tunnel_runtime" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"cloudflareId" text NOT NULL,
	"serverId" text,
	"tunnelId" text NOT NULL,
	"tunnelName" text NOT NULL,
	"dockerResourceName" text NOT NULL,
	"runtimeMode" "cloudflareTunnelRuntimeMode" DEFAULT 'shared-managed' NOT NULL,
	"status" "cloudflareTunnelRuntimeStatus" DEFAULT 'pending' NOT NULL,
	"lastError" text,
	"lastStartedAt" timestamp,
	"lastSeenAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "publishToCloudflare" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "cloudflareTunnelMode" "cloudflareTunnelMode";--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "cloudflareId" text;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "cloudflareZoneId" text;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "cloudflareTunnelId" text;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "cloudflareDnsRecordId" text;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "cloudflareIngressApplied" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cloudflare_tunnel_runtime" ADD CONSTRAINT "cloudflare_tunnel_runtime_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloudflare_tunnel_runtime" ADD CONSTRAINT "cloudflare_tunnel_runtime_cloudflareId_cloudflare_cloudflareId_fk" FOREIGN KEY ("cloudflareId") REFERENCES "public"."cloudflare"("cloudflareId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cloudflare_tunnel_runtime_org_server_cf_unique" ON "cloudflare_tunnel_runtime" USING btree ("organizationId","serverId","cloudflareId");--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_cloudflareId_cloudflare_cloudflareId_fk" FOREIGN KEY ("cloudflareId") REFERENCES "public"."cloudflare"("cloudflareId") ON DELETE set null ON UPDATE no action;

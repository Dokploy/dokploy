CREATE TYPE "public"."DnsProviderType" AS ENUM('cloudflare', 'route53');--> statement-breakpoint
CREATE TABLE "dns_provider" (
	"dnsProviderId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"providerType" "DnsProviderType" NOT NULL,
	"config" jsonb NOT NULL,
	"organizationId" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dns_provider" ADD CONSTRAINT "dns_provider_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dns_provider_org_name_idx" ON "dns_provider" USING btree ("organizationId","name");
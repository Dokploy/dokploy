CREATE TYPE "public"."dnsProviderType" AS ENUM('cloudflare', 'route53', 'digitalocean', 'namecheap', 'gandi', 'azure', 'google');--> statement-breakpoint
CREATE TABLE "dns_provider" (
	"dnsProviderId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "dnsProviderType" NOT NULL,
	"apiToken" text,
	"secretAccessKey" text,
	"accessKeyId" text,
	"region" text,
	"ttl" text DEFAULT '1',
	"organizationId" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dns_provider" ADD CONSTRAINT "dns_provider_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
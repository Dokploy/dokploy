CREATE TYPE "public"."domainProviderType" AS ENUM('netlify', 'namecheap');--> statement-breakpoint
CREATE TYPE "public"."netlifyAuthMethod" AS ENUM('oauth', 'direct');--> statement-breakpoint
CREATE TABLE "domain_provider" (
	"domainProviderId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "domainProviderType" NOT NULL,
	"apiKey" text,
	"apiToken" text,
	"clientId" text,
	"clientSecret" text,
	"accessToken" text,
	"refreshToken" text,
	"tokenExpiresAt" text,
	"authMethod" "netlifyAuthMethod",
	"apiUser" text,
	"clientIp" text,
	"enablePurchase" boolean DEFAULT false NOT NULL,
	"organizationId" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain_provider" ADD CONSTRAINT "domain_provider_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
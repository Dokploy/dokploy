CREATE TABLE "cloudflare_access_application" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"cloudflareId" text NOT NULL,
	"domainId" text NOT NULL,
	"cloudflareAppId" text NOT NULL,
	"cloudflarePolicyId" text,
	"appDomain" text NOT NULL,
	"sessionDuration" text DEFAULT '24h' NOT NULL,
	"allowEmails" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"allowEmailDomains" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "enableCloudflareAccess" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "cloudflareAccessApplicationId" text;--> statement-breakpoint
ALTER TABLE "cloudflare_access_application" ADD CONSTRAINT "cloudflare_access_application_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloudflare_access_application" ADD CONSTRAINT "cloudflare_access_application_cloudflareId_cloudflare_cloudflareId_fk" FOREIGN KEY ("cloudflareId") REFERENCES "public"."cloudflare"("cloudflareId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloudflare_access_application" ADD CONSTRAINT "cloudflare_access_application_domainId_domain_domainId_fk" FOREIGN KEY ("domainId") REFERENCES "public"."domain"("domainId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cloudflare_access_application_domainId_unique" ON "cloudflare_access_application" USING btree ("domainId");--> statement-breakpoint
ALTER TABLE "cloudflare" ADD COLUMN "defaultSessionDuration" text DEFAULT '168h' NOT NULL;--> statement-breakpoint
ALTER TABLE "cloudflare" ADD COLUMN "protectDomainsByDefault" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cloudflare" ADD COLUMN "requireProtectedDomains" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cloudflare" ADD COLUMN "defaultAllowEmails" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "cloudflare" ADD COLUMN "defaultAllowEmailDomains" text[] DEFAULT ARRAY[]::text[] NOT NULL;
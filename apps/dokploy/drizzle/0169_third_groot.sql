CREATE TABLE "cloudflare" (
	"cloudflareId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"apiToken" text NOT NULL,
	"accountId" text NOT NULL,
	"defaultTunnelId" text,
	"organizationId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cloudflare" ADD CONSTRAINT "cloudflare_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
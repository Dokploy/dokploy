ALTER TABLE "application" ADD COLUMN "previewNetworkIds" text[];--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "networkId" text;--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_networkId_network_networkId_fk" FOREIGN KEY ("networkId") REFERENCES "public"."network"("networkId") ON DELETE set null ON UPDATE no action;
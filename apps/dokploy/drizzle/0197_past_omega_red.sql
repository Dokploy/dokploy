CREATE TYPE "public"."LogProviderType" AS ENUM('loki', 'datadog', 'betterstack', 'elasticsearch', 'splunk_hec', 'aws_cloudwatch');--> statement-breakpoint
CREATE TABLE "logProvider" (
	"logProviderId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"providerType" "LogProviderType" NOT NULL,
	"endpoint" text,
	"apiKey" text,
	"apiSecret" text,
	"extraConfig" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" text NOT NULL,
	"organizationId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "enableLogManagement" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "enableLogManagement" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "logManagementOrganizationId" text;--> statement-breakpoint
ALTER TABLE "logProvider" ADD CONSTRAINT "logProvider_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD CONSTRAINT "webServerSettings_logManagementOrganizationId_organization_id_fk" FOREIGN KEY ("logManagementOrganizationId") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
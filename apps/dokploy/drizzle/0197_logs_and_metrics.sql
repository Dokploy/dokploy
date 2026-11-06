CREATE TYPE "public"."TelemetryProviderType" AS ENUM('loki', 'datadog', 'betterstack', 'elasticsearch', 'splunk_hec', 'aws_cloudwatch', 'prometheus_remote_write', 'new_relic', 'influxdb');--> statement-breakpoint
CREATE TABLE "telemetryProvider" (
	"telemetryProviderId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"providerType" "TelemetryProviderType" NOT NULL,
	"signals" text[] NOT NULL,
	"endpoint" text,
	"apiKey" text,
	"apiSecret" text,
	"extraConfig" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" text NOT NULL,
	"organizationId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "telemetryProviderIds" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "telemetryProviderIds" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "vectorAgentOrganizationId" text;--> statement-breakpoint
ALTER TABLE "telemetryProvider" ADD CONSTRAINT "telemetryProvider_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD CONSTRAINT "webServerSettings_vectorAgentOrganizationId_organization_id_fk" FOREIGN KEY ("vectorAgentOrganizationId") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
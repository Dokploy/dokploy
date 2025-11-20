CREATE TYPE "public"."cloudProvider" AS ENUM('hetzner');--> statement-breakpoint
CREATE TYPE "public"."provisioningStatus" AS ENUM('pending', 'generating_ssh_key', 'uploading_ssh_key', 'creating_server', 'configuring_dokploy', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "cloud_provider_credentials" (
	"credentialId" text PRIMARY KEY NOT NULL,
	"provider" "cloudProvider" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"encryptedApiToken" text NOT NULL,
	"additionalConfig" jsonb,
	"lastValidated" timestamp,
	"isValid" text DEFAULT 'unknown',
	"organizationId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_provisioning_job" (
	"jobId" text PRIMARY KEY NOT NULL,
	"credentialId" text NOT NULL,
	"serverId" text,
	"providerServerId" text,
	"providerSshKeyId" text,
	"status" "provisioningStatus" DEFAULT 'pending' NOT NULL,
	"message" text,
	"error" text,
	"config" jsonb NOT NULL,
	"result" jsonb,
	"organizationId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "cloudProvider" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "providerServerId" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "providerMetadata" jsonb;--> statement-breakpoint
ALTER TABLE "cloud_provider_credentials" ADD CONSTRAINT "cloud_provider_credentials_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_provisioning_job" ADD CONSTRAINT "server_provisioning_job_credentialId_cloud_provider_credentials_credentialId_fk" FOREIGN KEY ("credentialId") REFERENCES "public"."cloud_provider_credentials"("credentialId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_provisioning_job" ADD CONSTRAINT "server_provisioning_job_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_provisioning_job" ADD CONSTRAINT "server_provisioning_job_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
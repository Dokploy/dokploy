CREATE TYPE "public"."VaultProviderType" AS ENUM('hashicorp', 'infisical', 'aws', 'doppler', 'azure');--> statement-breakpoint
CREATE TABLE "vault_provider" (
	"vaultProviderId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"providerType" "VaultProviderType" NOT NULL,
	"config" jsonb NOT NULL,
	"assignments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"organizationId" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vault_provider" ADD CONSTRAINT "vault_provider_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vault_provider_org_name_idx" ON "vault_provider" USING btree ("organizationId","name");
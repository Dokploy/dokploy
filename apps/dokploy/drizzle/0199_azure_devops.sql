ALTER TYPE "public"."sourceType" ADD VALUE 'azureDevops' BEFORE 'drop';--> statement-breakpoint
ALTER TYPE "public"."sourceTypeCompose" ADD VALUE 'azureDevops' BEFORE 'raw';--> statement-breakpoint
ALTER TYPE "public"."gitProviderType" ADD VALUE 'azureDevops';--> statement-breakpoint
CREATE TABLE "azure_devops" (
	"azureDevopsId" text PRIMARY KEY NOT NULL,
	"gitProviderId" text NOT NULL,
	"baseUrl" text NOT NULL,
	"personalAccessToken" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "azure_devops_hook" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"serviceId" text NOT NULL,
	"serviceType" text NOT NULL,
	"azureDevopsId" text NOT NULL,
	"baseUrl" text NOT NULL,
	"projectId" text NOT NULL,
	"subscriptionId" text,
	"configurationHash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"lastSyncedAt" text,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsId" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsProjectId" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsRepositoryId" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsProjectName" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsRepositoryName" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsBranch" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsBuildPath" text DEFAULT '/';--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "azureDevopsId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "azureDevopsProjectId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "azureDevopsRepositoryId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "azureDevopsProjectName" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "azureDevopsRepositoryName" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "azureDevopsBranch" text;--> statement-breakpoint
ALTER TABLE "azure_devops" ADD CONSTRAINT "azure_devops_gitProviderId_git_provider_gitProviderId_fk" FOREIGN KEY ("gitProviderId") REFERENCES "public"."git_provider"("gitProviderId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "azure_devops_hook_service_provider" ON "azure_devops_hook" USING btree ("serviceType","serviceId","azureDevopsId");--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_azureDevopsId_azure_devops_azureDevopsId_fk" FOREIGN KEY ("azureDevopsId") REFERENCES "public"."azure_devops"("azureDevopsId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compose" ADD CONSTRAINT "compose_azureDevopsId_azure_devops_azureDevopsId_fk" FOREIGN KEY ("azureDevopsId") REFERENCES "public"."azure_devops"("azureDevopsId") ON DELETE set null ON UPDATE no action;

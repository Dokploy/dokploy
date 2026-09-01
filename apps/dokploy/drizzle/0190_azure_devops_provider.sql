ALTER TYPE "public"."sourceType" ADD VALUE 'azureDevops';--> statement-breakpoint
ALTER TYPE "public"."sourceTypeCompose" ADD VALUE 'azureDevops';--> statement-breakpoint
ALTER TYPE "public"."gitProviderType" ADD VALUE 'azureDevops';--> statement-breakpoint
CREATE TABLE "azure_devops" (
	"azureDevopsId" text PRIMARY KEY NOT NULL,
	"organizationName" text NOT NULL,
	"personalAccessToken" text NOT NULL,
	"gitProviderId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsRepositoryId" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsRepository" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsProjectId" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsProject" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsRemoteUrl" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsBranch" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsBuildPath" text DEFAULT '/';--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "azureDevopsId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "azureDevopsRepositoryId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "azureDevopsRepository" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "azureDevopsProjectId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "azureDevopsProject" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "azureDevopsRemoteUrl" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "azureDevopsBranch" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "azureDevopsId" text;--> statement-breakpoint
ALTER TABLE "azure_devops" ADD CONSTRAINT "azure_devops_gitProviderId_git_provider_gitProviderId_fk" FOREIGN KEY ("gitProviderId") REFERENCES "public"."git_provider"("gitProviderId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_azureDevopsId_azure_devops_azureDevopsId_fk" FOREIGN KEY ("azureDevopsId") REFERENCES "public"."azure_devops"("azureDevopsId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compose" ADD CONSTRAINT "compose_azureDevopsId_azure_devops_azureDevopsId_fk" FOREIGN KEY ("azureDevopsId") REFERENCES "public"."azure_devops"("azureDevopsId") ON DELETE set null ON UPDATE no action;
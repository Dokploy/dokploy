ALTER TYPE "public"."gitProviderType" ADD VALUE 'gitea';--> statement-breakpoint
CREATE TABLE "gitea" (
	"giteaId" text PRIMARY KEY NOT NULL,
	"giteaUrl" text DEFAULT 'https://gitea.com' NOT NULL,
	"application_id" text,
	"redirect_uri" text,
	"secret" text,
	"access_token" text,
	"refresh_token" text,
	"organization_name" text,
	"expires_at" integer,
	"gitProviderId" text NOT NULL,
	"gitea_username" text
);
--> statement-breakpoint
ALTER TABLE "gitea" ADD CONSTRAINT "gitea_gitProviderId_git_provider_gitProviderId_fk" FOREIGN KEY ("gitProviderId") REFERENCES "public"."git_provider"("gitProviderId") ON DELETE cascade ON UPDATE no action;
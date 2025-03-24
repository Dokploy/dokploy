ALTER TYPE "public"."sourceType" ADD VALUE 'gitea' BEFORE 'drop';--> statement-breakpoint
ALTER TYPE "public"."sourceTypeCompose" ADD VALUE 'gitea' BEFORE 'raw';--> statement-breakpoint
ALTER TYPE "public"."gitProviderType" ADD VALUE 'gitea';--> statement-breakpoint
CREATE TABLE "gitea" (
	"giteaId" text PRIMARY KEY NOT NULL,
	"giteaUrl" text DEFAULT 'https://gitea.com' NOT NULL,
	"redirect_uri" text,
	"client_id" text,
	"client_secret" text,
	"gitProviderId" text NOT NULL,
	"gitea_username" text,
	"access_token" text,
	"refresh_token" text,
	"expires_at" integer,
	"scopes" text DEFAULT 'repo,repo:status,read:user,read:org',
	"last_authenticated_at" integer
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "giteaProjectId" integer;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "giteaRepository" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "giteaOwner" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "giteaBranch" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "giteaBuildPath" text DEFAULT '/';--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "giteaId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "giteaRepository" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "giteaOwner" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "giteaBranch" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "giteaId" text;--> statement-breakpoint
ALTER TABLE "gitea" ADD CONSTRAINT "gitea_gitProviderId_git_provider_gitProviderId_fk" FOREIGN KEY ("gitProviderId") REFERENCES "public"."git_provider"("gitProviderId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_giteaId_gitea_giteaId_fk" FOREIGN KEY ("giteaId") REFERENCES "public"."gitea"("giteaId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compose" ADD CONSTRAINT "compose_giteaId_gitea_giteaId_fk" FOREIGN KEY ("giteaId") REFERENCES "public"."gitea"("giteaId") ON DELETE set null ON UPDATE no action;
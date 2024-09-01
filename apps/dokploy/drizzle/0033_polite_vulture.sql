DO $$ BEGIN
 CREATE TYPE "public"."gitProviderType" AS ENUM('github', 'gitlab', 'bitbucket');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bitbucket_provider" (
	"bitbucketProviderId" text PRIMARY KEY NOT NULL,
	"bitbucketUsername" text,
	"appPassword" text,
	"bitbucketWorkspaceName" text,
	"gitProviderId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "git_provider" (
	"gitProviderId" text PRIMARY KEY NOT NULL,
	"providerType" "gitProviderType" DEFAULT 'github' NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_provider" (
	"githubProviderId" text PRIMARY KEY NOT NULL,
	"githubAppId" integer,
	"githubClientId" text,
	"githubClientSecret" text,
	"githubInstallationId" text,
	"githubPrivateKey" text,
	"githubWebhookSecret" text,
	"gitProviderId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gitlab_provider" (
	"github_provider_id" text PRIMARY KEY NOT NULL,
	"application_id" text,
	"application_secret" text,
	"group_name" text,
	"gitProviderId" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bitbucket_provider" ADD CONSTRAINT "bitbucket_provider_gitProviderId_git_provider_gitProviderId_fk" FOREIGN KEY ("gitProviderId") REFERENCES "public"."git_provider"("gitProviderId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_provider" ADD CONSTRAINT "github_provider_gitProviderId_git_provider_gitProviderId_fk" FOREIGN KEY ("gitProviderId") REFERENCES "public"."git_provider"("gitProviderId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gitlab_provider" ADD CONSTRAINT "gitlab_provider_gitProviderId_git_provider_gitProviderId_fk" FOREIGN KEY ("gitProviderId") REFERENCES "public"."git_provider"("gitProviderId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

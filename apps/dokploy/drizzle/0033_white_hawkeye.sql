DO $$ BEGIN
 CREATE TYPE "public"."gitProviderType" AS ENUM('github', 'gitlab', 'bitbucket');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "sourceType" ADD VALUE 'gitlab';--> statement-breakpoint
ALTER TYPE "sourceType" ADD VALUE 'bitbucket';--> statement-breakpoint
ALTER TYPE "sourceTypeCompose" ADD VALUE 'gitlab';--> statement-breakpoint
ALTER TYPE "sourceTypeCompose" ADD VALUE 'bitbucket';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "git_provider" (
	"gitProviderId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"providerType" "gitProviderType" DEFAULT 'github' NOT NULL,
	"createdAt" text NOT NULL,
	"authId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bitbucket" (
	"bitbucketId" text PRIMARY KEY NOT NULL,
	"bitbucketUsername" text,
	"appPassword" text,
	"bitbucketWorkspaceName" text,
	"gitProviderId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github" (
	"githubId" text PRIMARY KEY NOT NULL,
	"githubAppName" text,
	"githubAppId" integer,
	"githubClientId" text,
	"githubClientSecret" text,
	"githubInstallationId" text,
	"githubPrivateKey" text,
	"githubWebhookSecret" text,
	"gitProviderId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gitlab" (
	"gitlabId" text PRIMARY KEY NOT NULL,
	"application_id" text,
	"redirect_uri" text,
	"secret" text,
	"access_token" text,
	"refresh_token" text,
	"group_name" text,
	"expires_at" integer,
	"gitProviderId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "gitlabProjectId" integer;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "gitlabRepository" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "gitlabOwner" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "gitlabBranch" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "gitlabBuildPath" text DEFAULT '/';--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "gitlabPathNamespace" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "bitbucketRepository" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "bitbucketOwner" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "bitbucketBranch" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "bitbucketBuildPath" text DEFAULT '/';--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "githubId" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "gitlabId" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "bitbucketId" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "canAccessToGitProviders" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "gitlabProjectId" integer;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "gitlabRepository" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "gitlabOwner" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "gitlabBranch" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "gitlabPathNamespace" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "bitbucketRepository" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "bitbucketOwner" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "bitbucketBranch" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "githubId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "gitlabId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "bitbucketId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_authId_auth_id_fk" FOREIGN KEY ("authId") REFERENCES "public"."auth"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bitbucket" ADD CONSTRAINT "bitbucket_gitProviderId_git_provider_gitProviderId_fk" FOREIGN KEY ("gitProviderId") REFERENCES "public"."git_provider"("gitProviderId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github" ADD CONSTRAINT "github_gitProviderId_git_provider_gitProviderId_fk" FOREIGN KEY ("gitProviderId") REFERENCES "public"."git_provider"("gitProviderId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gitlab" ADD CONSTRAINT "gitlab_gitProviderId_git_provider_gitProviderId_fk" FOREIGN KEY ("gitProviderId") REFERENCES "public"."git_provider"("gitProviderId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_githubId_github_githubId_fk" FOREIGN KEY ("githubId") REFERENCES "public"."github"("githubId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_gitlabId_gitlab_gitlabId_fk" FOREIGN KEY ("gitlabId") REFERENCES "public"."gitlab"("gitlabId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_bitbucketId_bitbucket_bitbucketId_fk" FOREIGN KEY ("bitbucketId") REFERENCES "public"."bitbucket"("bitbucketId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compose" ADD CONSTRAINT "compose_githubId_github_githubId_fk" FOREIGN KEY ("githubId") REFERENCES "public"."github"("githubId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compose" ADD CONSTRAINT "compose_gitlabId_gitlab_gitlabId_fk" FOREIGN KEY ("gitlabId") REFERENCES "public"."gitlab"("gitlabId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compose" ADD CONSTRAINT "compose_bitbucketId_bitbucket_bitbucketId_fk" FOREIGN KEY ("bitbucketId") REFERENCES "public"."bitbucket"("bitbucketId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "githubAppId";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "githubAppName";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "githubClientId";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "githubClientSecret";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "githubInstallationId";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "githubPrivateKey";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "githubWebhookSecret";
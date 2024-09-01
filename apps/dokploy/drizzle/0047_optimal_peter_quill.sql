ALTER TABLE "application" RENAME COLUMN "githubProviderId" TO "githubId";--> statement-breakpoint
ALTER TABLE "application" RENAME COLUMN "gitlabProviderId" TO "gitlabId";--> statement-breakpoint
ALTER TABLE "application" RENAME COLUMN "bitbucketProviderId" TO "bitbucketId";--> statement-breakpoint
ALTER TABLE "bitbucket_provider" RENAME COLUMN "bitbucketProviderId" TO "bitbucketId";--> statement-breakpoint
ALTER TABLE "github_provider" RENAME COLUMN "githubProviderId" TO "githubId";--> statement-breakpoint
ALTER TABLE "gitlab_provider" RENAME COLUMN "gitlabProviderId" TO "gitlabId";--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT "application_githubProviderId_github_provider_githubProviderId_fk";
--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT "application_gitlabProviderId_gitlab_provider_gitlabProviderId_fk";
--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT "application_bitbucketProviderId_bitbucket_provider_bitbucketProviderId_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_githubId_github_provider_githubId_fk" FOREIGN KEY ("githubId") REFERENCES "public"."github_provider"("githubId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_gitlabId_gitlab_provider_gitlabId_fk" FOREIGN KEY ("gitlabId") REFERENCES "public"."gitlab_provider"("gitlabId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_bitbucketId_bitbucket_provider_bitbucketId_fk" FOREIGN KEY ("bitbucketId") REFERENCES "public"."bitbucket_provider"("bitbucketId") ON DELETE set null ON UPDATE no action;
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
ALTER TABLE "bitbucket_provider" RENAME TO "bitbucket";--> statement-breakpoint
ALTER TABLE "github_provider" RENAME TO "github";--> statement-breakpoint
ALTER TABLE "gitlab_provider" RENAME TO "gitlab";--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT "application_githubId_github_provider_githubId_fk";
--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT "application_gitlabId_gitlab_provider_gitlabId_fk";
--> statement-breakpoint
ALTER TABLE "application" DROP CONSTRAINT "application_bitbucketId_bitbucket_provider_bitbucketId_fk";
--> statement-breakpoint
ALTER TABLE "compose" DROP CONSTRAINT "compose_githubId_github_provider_githubId_fk";
--> statement-breakpoint
ALTER TABLE "compose" DROP CONSTRAINT "compose_gitlabId_gitlab_provider_gitlabId_fk";
--> statement-breakpoint
ALTER TABLE "compose" DROP CONSTRAINT "compose_bitbucketId_bitbucket_provider_bitbucketId_fk";
--> statement-breakpoint
ALTER TABLE "bitbucket" DROP CONSTRAINT "bitbucket_provider_gitProviderId_git_provider_gitProviderId_fk";
--> statement-breakpoint
ALTER TABLE "github" DROP CONSTRAINT "github_provider_gitProviderId_git_provider_gitProviderId_fk";
--> statement-breakpoint
ALTER TABLE "gitlab" DROP CONSTRAINT "gitlab_provider_gitProviderId_git_provider_gitProviderId_fk";
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

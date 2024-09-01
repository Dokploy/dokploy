ALTER TYPE "sourceType" ADD VALUE 'gitlab';--> statement-breakpoint
ALTER TYPE "sourceType" ADD VALUE 'bitbucket';--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "gitlabRepository" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "gitlabOwner" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "gitlabBranch" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "gitlabBuildPath" text DEFAULT '/';--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "gitlabProviderId" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "bitbucketProviderId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_gitlabProviderId_gitlab_provider_gitlabProviderId_fk" FOREIGN KEY ("gitlabProviderId") REFERENCES "public"."gitlab_provider"("gitlabProviderId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_bitbucketProviderId_bitbucket_provider_bitbucketProviderId_fk" FOREIGN KEY ("bitbucketProviderId") REFERENCES "public"."bitbucket_provider"("bitbucketProviderId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

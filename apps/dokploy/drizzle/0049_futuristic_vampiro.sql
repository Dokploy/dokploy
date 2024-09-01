ALTER TYPE "sourceTypeCompose" ADD VALUE 'gitlab';--> statement-breakpoint
ALTER TYPE "sourceTypeCompose" ADD VALUE 'bitbucket';--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "gitlabProjectId" integer;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "gitlabRepository" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "gitlabOwner" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "gitlabBranch" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "gitlabBuildPath" text DEFAULT '/';--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "bitbucketRepository" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "bitbucketOwner" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "bitbucketBranch" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "bitbucketBuildPath" text DEFAULT '/';--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "githubId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "gitlabId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "bitbucketId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compose" ADD CONSTRAINT "compose_githubId_github_provider_githubId_fk" FOREIGN KEY ("githubId") REFERENCES "public"."github_provider"("githubId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compose" ADD CONSTRAINT "compose_gitlabId_gitlab_provider_gitlabId_fk" FOREIGN KEY ("gitlabId") REFERENCES "public"."gitlab_provider"("gitlabId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compose" ADD CONSTRAINT "compose_bitbucketId_bitbucket_provider_bitbucketId_fk" FOREIGN KEY ("bitbucketId") REFERENCES "public"."bitbucket_provider"("bitbucketId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

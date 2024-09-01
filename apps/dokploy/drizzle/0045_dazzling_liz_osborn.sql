ALTER TABLE "application" ADD COLUMN "bitbucketRepository" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "bitbucketOwner" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "bitbucketBranch" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "bitbucketBuildPath" text DEFAULT '/';
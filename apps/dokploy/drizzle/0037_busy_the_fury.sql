ALTER TABLE "application" DROP CONSTRAINT "application_githubProviderId_github_provider_githubProviderId_fk";
--> statement-breakpoint
ALTER TABLE "git_provider" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_githubProviderId_github_provider_githubProviderId_fk" FOREIGN KEY ("githubProviderId") REFERENCES "public"."github_provider"("githubProviderId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

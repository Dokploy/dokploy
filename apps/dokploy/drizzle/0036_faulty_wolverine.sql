ALTER TABLE "application" ADD COLUMN "githubProviderId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_githubProviderId_github_provider_githubProviderId_fk" FOREIGN KEY ("githubProviderId") REFERENCES "public"."github_provider"("githubProviderId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

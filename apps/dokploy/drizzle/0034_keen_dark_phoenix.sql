ALTER TABLE "git_provider" ADD COLUMN "authId" text NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_authId_auth_id_fk" FOREIGN KEY ("authId") REFERENCES "public"."auth"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

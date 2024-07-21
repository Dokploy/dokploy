DO $$ BEGIN
 CREATE TYPE "public"."applicationType" AS ENUM('application', 'compose');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "applicationType" "applicationType" DEFAULT 'application' NOT NULL;
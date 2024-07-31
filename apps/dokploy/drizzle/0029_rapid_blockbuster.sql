DO $$ BEGIN
 CREATE TYPE "public"."domainType" AS ENUM('compose', 'application');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "domainType" "domainType" DEFAULT 'application';
DO $$ BEGIN
 CREATE TYPE "public"."serverStatus" AS ENUM('active', 'inactive');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "admin" RENAME COLUMN "totalServers" TO "serversQuantity";--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "serverStatus" "serverStatus" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "stripeSubscriptionStatus";
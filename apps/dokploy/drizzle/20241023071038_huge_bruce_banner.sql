DO $$ BEGIN
 CREATE TYPE "public"."serverStatus" AS ENUM('active', 'inactive');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "stripeCustomerId" text;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "stripeSubscriptionId" text;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "serversQuantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth" ADD COLUMN "resetPasswordToken" text;--> statement-breakpoint
ALTER TABLE "auth" ADD COLUMN "resetPasswordExpiresAt" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "serverStatus" "serverStatus" DEFAULT 'active' NOT NULL;
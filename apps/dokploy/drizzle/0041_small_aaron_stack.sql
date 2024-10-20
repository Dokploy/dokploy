ALTER TABLE "admin" ADD COLUMN "stripeCustomerId" text;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "stripeSubscriptionId" text;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "totalServers" integer DEFAULT 0 NOT NULL;
CREATE TYPE "public"."payment_type" AS ENUM('subscription', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('free', 'pro', 'agency');--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "plan" SET DATA TYPE "public"."subscription_plan" USING "plan"::"public"."subscription_plan";--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "type" "payment_type" DEFAULT 'subscription' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "subscriptionId" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "serviceCode" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_subscriptionId_subscription_id_fk" FOREIGN KEY ("subscriptionId") REFERENCES "public"."subscription"("id") ON DELETE set null ON UPDATE no action;
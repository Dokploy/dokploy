ALTER TYPE "public"."managedServerStatus" ADD VALUE 'suspended' BEFORE 'terminating';--> statement-breakpoint
ALTER TABLE "managed_server" ADD COLUMN "stripeCheckoutSessionId" text;--> statement-breakpoint
ALTER TABLE "managed_server" ADD COLUMN "suspendedAt" text;
ALTER TYPE "public"."certificateType" ADD VALUE 'custom';--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "customCertResolver" text;--> statement-breakpoint
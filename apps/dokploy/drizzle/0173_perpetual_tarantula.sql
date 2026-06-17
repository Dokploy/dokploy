CREATE TYPE "public"."domainValidationMode" AS ENUM('auto', 'proxy', 'skip');--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "validationMode" "domainValidationMode" DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "expectedIp" text;
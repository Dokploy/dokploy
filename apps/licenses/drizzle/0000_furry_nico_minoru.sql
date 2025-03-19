CREATE TYPE "public"."billing_type" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."license_status" AS ENUM('active', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."license_type" AS ENUM('basic', 'premium', 'business');--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" text NOT NULL,
	"product_id" text NOT NULL,
	"license_key" text NOT NULL,
	"status" "license_status" DEFAULT 'active' NOT NULL,
	"type" "license_type" NOT NULL,
	"billing_type" "billing_type" NOT NULL,
	"server_ip" text,
	"activated_at" timestamp,
	"last_verified_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"metadata" text,
	"email" text NOT NULL,
	CONSTRAINT "licenses_license_key_unique" UNIQUE("license_key")
);

-- Create table only if it does not already exist to make this migration idempotent
CREATE TABLE IF NOT EXISTS "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"issuer" text NOT NULL,
	"domain" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text,
	"organization_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Add foreign key constraint only if it does not exist
DO $$
BEGIN
	-- Only add the foreign key if the constraint doesn't exist AND the column exists
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint c
		JOIN pg_class t ON c.conrelid = t.oid
		WHERE c.conname = 'sso_provider_user_id_user_temp_id_fk'
	) AND EXISTS (
		SELECT 1 FROM information_schema.columns WHERE table_name = 'sso_provider' AND column_name = 'user_id'
	) THEN
		ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_temp_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_temp"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END$$;
--> statement-breakpoint
-- Create unique index if it does not already exist
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
		WHERE c.relkind = 'i'
		AND c.relname = 'sso_provider_provider_id_unq'
	) THEN
		CREATE UNIQUE INDEX "sso_provider_provider_id_unq" ON "sso_provider" USING btree ("provider_id");
	END IF;
END$$;
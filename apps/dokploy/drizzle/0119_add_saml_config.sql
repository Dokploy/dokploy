-- Add saml_config column to sso_provider for SAML support
ALTER TABLE "sso_provider" ADD COLUMN IF NOT EXISTS "saml_config" text;

-- Add user_id column to sso_provider table if it doesn't exist  
ALTER TABLE "sso_provider" ADD COLUMN IF NOT EXISTS "user_id" text;

-- Add organization_id column to sso_provider table if it doesn't exist
ALTER TABLE "sso_provider" ADD COLUMN IF NOT EXISTS "organization_id" text;

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

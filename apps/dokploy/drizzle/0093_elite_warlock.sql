-- Add the userId column as nullable first
ALTER TABLE "git_provider" ADD COLUMN "userId" text;--> statement-breakpoint

-- Add the unique constraint on account.user_id first (needed for foreign key)
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_unique" UNIQUE("user_id");--> statement-breakpoint

-- Update existing git providers to be owned by the organization owner
-- We need to get the account.user_id for the organization owner
UPDATE "git_provider" 
SET "userId" = (
    SELECT a.user_id 
    FROM "organization" o 
    JOIN "account" a ON o."owner_id" = a.user_id 
    WHERE o.id = "git_provider"."organizationId"
);--> statement-breakpoint

-- Now make the column NOT NULL since all rows should have values
ALTER TABLE "git_provider" ALTER COLUMN "userId" SET NOT NULL;--> statement-breakpoint

-- Add the foreign key constraint (after unique constraint exists)
ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_userId_account_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."account"("user_id") ON DELETE cascade ON UPDATE no action;
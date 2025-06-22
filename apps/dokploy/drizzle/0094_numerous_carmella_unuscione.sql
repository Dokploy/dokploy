ALTER TABLE "git_provider" ADD COLUMN "userId" text;--> statement-breakpoint

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
ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;
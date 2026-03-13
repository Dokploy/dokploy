ALTER TABLE "git_provider" ADD COLUMN "userId" text;--> statement-breakpoint

-- Update existing git providers to be owned by the organization owner
-- We can get the owner_id directly from the organization table
UPDATE "git_provider" 
SET "userId" = (
    SELECT o."owner_id" 
    FROM "organization" o 
    WHERE o.id = "git_provider"."organizationId"
);--> statement-breakpoint

-- Now make the column NOT NULL since all rows should have values
ALTER TABLE "git_provider" ALTER COLUMN "userId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;
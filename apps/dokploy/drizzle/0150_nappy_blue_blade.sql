ALTER TABLE "apikey" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "apikey" ADD COLUMN "config_id" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "apikey" ADD COLUMN "reference_id" text;--> statement-breakpoint
UPDATE "apikey" SET "reference_id" = "user_id" WHERE "reference_id" IS NULL;--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "reference_id" SET NOT NULL;

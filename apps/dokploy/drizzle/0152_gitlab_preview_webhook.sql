ALTER TABLE "gitlab" ADD COLUMN "webhook_secret" text;
--> statement-breakpoint
UPDATE "gitlab" SET "webhook_secret" = gen_random_uuid()::text WHERE "webhook_secret" IS NULL;
--> statement-breakpoint
ALTER TABLE "gitlab" ALTER COLUMN "webhook_secret" SET NOT NULL;

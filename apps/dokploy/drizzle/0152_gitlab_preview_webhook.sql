ALTER TABLE "gitlab" ADD COLUMN "webhook_secret" text;
--> statement-breakpoint
UPDATE "gitlab" SET "webhook_secret" = encode(gen_random_bytes(21), 'base64') WHERE "webhook_secret" IS NULL;
--> statement-breakpoint
ALTER TABLE "gitlab" ALTER COLUMN "webhook_secret" SET NOT NULL;

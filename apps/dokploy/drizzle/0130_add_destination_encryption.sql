DO $$ BEGIN
 CREATE TYPE "public"."encryptionMethod" AS ENUM('aes-256-cbc', 'aes-256-gcm');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "encryptionEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "encryptionMethod" "encryptionMethod";--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "encryptionKey" text;

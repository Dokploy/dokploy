ALTER TABLE "destination" ADD COLUMN "encryptionEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "encryptionKey" text;

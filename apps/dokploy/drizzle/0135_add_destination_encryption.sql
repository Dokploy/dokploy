ALTER TABLE "destination" ADD COLUMN "encryptionEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "encryptionKey" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "encryptionPassword2" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "filenameEncryption" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "directoryNameEncryption" boolean DEFAULT false NOT NULL;

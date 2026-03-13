ALTER TABLE "domain" ADD COLUMN "internalPath" text DEFAULT '/';--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "stripPath" boolean DEFAULT false NOT NULL;
ALTER TABLE "organization" ADD COLUMN "lastNotifiedUpdateVersion" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "dokployUpdate" boolean DEFAULT false NOT NULL;
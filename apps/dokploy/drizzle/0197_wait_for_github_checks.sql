ALTER TABLE "application" ADD COLUMN "waitForChecks" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "waitForChecks" boolean DEFAULT false NOT NULL;
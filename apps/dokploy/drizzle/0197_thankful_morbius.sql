ALTER TABLE "application" ADD COLUMN "customCommand" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "customShell" text DEFAULT 'sh';
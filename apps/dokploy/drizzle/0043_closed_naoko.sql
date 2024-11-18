ALTER TABLE "admin" ADD COLUMN "env" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "env" text DEFAULT '' NOT NULL;
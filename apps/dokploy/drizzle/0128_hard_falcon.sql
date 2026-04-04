ALTER TABLE "user" RENAME COLUMN "name" TO "firstName";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "lastName" text DEFAULT '' NOT NULL;
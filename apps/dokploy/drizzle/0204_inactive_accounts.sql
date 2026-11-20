ALTER TABLE "user" ADD COLUMN "lastSessionAt" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deactivatedAt" timestamp;--> statement-breakpoint
UPDATE "user" SET "lastSessionAt" = now() at time zone 'utc';

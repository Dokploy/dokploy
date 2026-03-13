ALTER TYPE "notificationType" ADD VALUE 'gotify';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gotify" (
	"gotifyId" text PRIMARY KEY NOT NULL,
	"serverUrl" text NOT NULL,
	"appToken" text NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"decoration" boolean
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "gotifyId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_gotifyId_gotify_gotifyId_fk" FOREIGN KEY ("gotifyId") REFERENCES "public"."gotify"("gotifyId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

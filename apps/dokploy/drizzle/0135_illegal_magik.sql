ALTER TYPE "public"."notificationType" ADD VALUE 'pushover' BEFORE 'custom';--> statement-breakpoint
CREATE TABLE "pushover" (
	"pushoverId" text PRIMARY KEY NOT NULL,
	"userKey" text NOT NULL,
	"apiToken" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"retry" integer,
	"expire" integer
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "pushoverId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_pushoverId_pushover_pushoverId_fk" FOREIGN KEY ("pushoverId") REFERENCES "public"."pushover"("pushoverId") ON DELETE cascade ON UPDATE no action;
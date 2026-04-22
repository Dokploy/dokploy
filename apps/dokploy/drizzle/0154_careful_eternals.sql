ALTER TYPE "public"."notificationType" ADD VALUE 'mattermost' BEFORE 'pushover';--> statement-breakpoint
CREATE TABLE "mattermost" (
	"mattermostId" text PRIMARY KEY NOT NULL,
	"webhookUrl" text NOT NULL,
	"channel" text,
	"username" text
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "mattermostId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_mattermostId_mattermost_mattermostId_fk" FOREIGN KEY ("mattermostId") REFERENCES "public"."mattermost"("mattermostId") ON DELETE cascade ON UPDATE no action;
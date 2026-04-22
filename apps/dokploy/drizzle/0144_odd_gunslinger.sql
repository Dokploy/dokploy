ALTER TYPE "public"."notificationType" ADD VALUE 'teams';--> statement-breakpoint
CREATE TABLE "teams" (
	"teamsId" text PRIMARY KEY NOT NULL,
	"webhookUrl" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "teamsId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_teamsId_teams_teamsId_fk" FOREIGN KEY ("teamsId") REFERENCES "public"."teams"("teamsId") ON DELETE cascade ON UPDATE no action;
DO $$ BEGIN
 CREATE TYPE "public"."notificationType" AS ENUM('slack', 'telegram', 'discord', 'email');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discord" (
	"discordId" text PRIMARY KEY NOT NULL,
	"webhookUrl" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email" (
	"emailId" text PRIMARY KEY NOT NULL,
	"smtpServer" text NOT NULL,
	"smtpPort" integer NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"fromAddress" text NOT NULL,
	"toAddress" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification" (
	"notificationId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"appDeploy" boolean DEFAULT false NOT NULL,
	"userJoin" boolean DEFAULT false NOT NULL,
	"appBuildError" boolean DEFAULT false NOT NULL,
	"databaseBackup" boolean DEFAULT false NOT NULL,
	"dokployRestart" boolean DEFAULT false NOT NULL,
	"notificationType" "notificationType" NOT NULL,
	"createdAt" text NOT NULL,
	"slackId" text,
	"telegramId" text,
	"discordId" text,
	"emailId" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slack" (
	"slackId" text PRIMARY KEY NOT NULL,
	"webhookUrl" text NOT NULL,
	"channel" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telegram" (
	"telegramId" text PRIMARY KEY NOT NULL,
	"botToken" text NOT NULL,
	"chatId" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_slackId_slack_slackId_fk" FOREIGN KEY ("slackId") REFERENCES "public"."slack"("slackId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_telegramId_telegram_telegramId_fk" FOREIGN KEY ("telegramId") REFERENCES "public"."telegram"("telegramId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_discordId_discord_discordId_fk" FOREIGN KEY ("discordId") REFERENCES "public"."discord"("discordId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_emailId_email_emailId_fk" FOREIGN KEY ("emailId") REFERENCES "public"."email"("emailId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

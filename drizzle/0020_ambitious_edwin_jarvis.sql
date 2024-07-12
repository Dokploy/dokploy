DO $$ BEGIN
 CREATE TYPE "public"."notificationType" AS ENUM('slack', 'telegram', 'discord', 'email');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "notificationType" "notificationType" NOT NULL;
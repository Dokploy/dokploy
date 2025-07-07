ALTER TABLE "user_temp" ADD COLUMN "buildsConcurrency" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "buildsConcurrency" integer DEFAULT 1 NOT NULL;
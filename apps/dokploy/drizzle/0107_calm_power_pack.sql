ALTER TABLE "user_temp" ADD COLUMN "serverConcurrency" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "concurrency" integer DEFAULT 1 NOT NULL;
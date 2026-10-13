ALTER TABLE "server" ADD COLUMN "buildsConcurrency" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "buildsConcurrency" integer DEFAULT 1 NOT NULL;
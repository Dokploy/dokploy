DO $$ BEGIN
 CREATE TYPE "composeType" AS ENUM('docker-compose', 'stack');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "composeType" "composeType" DEFAULT 'docker-compose' NOT NULL;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "composePath" text DEFAULT './docker-compose.yml' NOT NULL;
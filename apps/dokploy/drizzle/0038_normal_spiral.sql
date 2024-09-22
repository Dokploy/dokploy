ALTER TABLE "server" ADD COLUMN "enableDockerCleanup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "server" DROP COLUMN IF EXISTS "redisPassword";
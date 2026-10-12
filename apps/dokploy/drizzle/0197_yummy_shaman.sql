CREATE TYPE "public"."webServerProvider" AS ENUM('traefik', 'caddy');--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "webServerProvider" "webServerProvider" DEFAULT 'traefik' NOT NULL;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "webServerProvider" "webServerProvider" DEFAULT 'traefik' NOT NULL;
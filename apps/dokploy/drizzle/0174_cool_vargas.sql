DO $$ BEGIN
	CREATE TYPE "public"."webServerProvider" AS ENUM('traefik', 'caddy');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN IF NOT EXISTS "webServerProvider" "webServerProvider" DEFAULT 'traefik' NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN IF NOT EXISTS "caddyTrustedProxyConfig" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN IF NOT EXISTS "webServerProvider" "webServerProvider" DEFAULT 'traefik' NOT NULL;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN IF NOT EXISTS "caddyTrustedProxyConfig" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN IF NOT EXISTS "requestLogsEnabled" boolean DEFAULT false NOT NULL;

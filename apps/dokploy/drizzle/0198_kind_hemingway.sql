ALTER TABLE "server" ADD COLUMN "logProviderIds" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "logProviderIds" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "server" DROP COLUMN "enableLogManagement";--> statement-breakpoint
ALTER TABLE "webServerSettings" DROP COLUMN "enableLogManagement";
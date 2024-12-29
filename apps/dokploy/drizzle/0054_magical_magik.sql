ALTER TABLE "server" ADD COLUMN "refreshRateMetrics" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "defaultPortMetrics" integer DEFAULT 4500 NOT NULL;
ALTER TABLE "server" RENAME COLUMN "refreshRateMetrics" TO "serverRefreshRateMetrics";--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "containerRefreshRateMetrics" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "containersMetricsDefinition" json;
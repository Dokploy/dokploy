ALTER TABLE "admin" ADD COLUMN "serverRefreshRateMetrics" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "containerRefreshRateMetrics" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "containersMetricsDefinition" json;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "defaultPortMetrics" integer DEFAULT 4500 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "metricsToken" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "metricsUrlCallback" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "thresholdCpu" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "thresholdMemory" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "serverThreshold" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "serverRefreshRateMetrics" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "containerRefreshRateMetrics" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "containersMetricsDefinition" json;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "defaultPortMetrics" integer DEFAULT 4500 NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "metricsToken" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "metricsUrlCallback" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "thresholdCpu" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "thresholdMemory" integer DEFAULT 0 NOT NULL;
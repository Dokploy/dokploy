ALTER TABLE "admin" ADD COLUMN "metricsConfig" json DEFAULT '{"server":{"refreshRate":20,"port":4500,"token":"","urlCallback":"","thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":20,"services":{"include":[],"exclude":[]}}}'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "metricsConfig" json DEFAULT '{"server":{"refreshRate":20,"port":4500,"token":"","urlCallback":"","thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":20,"services":{"include":[],"exclude":[]}}}'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "serverRefreshRateMetrics";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "containerRefreshRateMetrics";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "containersMetricsDefinition";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "defaultPortMetrics";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "metricsToken";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "metricsUrlCallback";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "thresholdCpu";--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "thresholdMemory";--> statement-breakpoint
ALTER TABLE "server" DROP COLUMN IF EXISTS "serverRefreshRateMetrics";--> statement-breakpoint
ALTER TABLE "server" DROP COLUMN IF EXISTS "containerRefreshRateMetrics";--> statement-breakpoint
ALTER TABLE "server" DROP COLUMN IF EXISTS "containersMetricsDefinition";--> statement-breakpoint
ALTER TABLE "server" DROP COLUMN IF EXISTS "defaultPortMetrics";--> statement-breakpoint
ALTER TABLE "server" DROP COLUMN IF EXISTS "metricsToken";--> statement-breakpoint
ALTER TABLE "server" DROP COLUMN IF EXISTS "metricsUrlCallback";--> statement-breakpoint
ALTER TABLE "server" DROP COLUMN IF EXISTS "thresholdCpu";--> statement-breakpoint
ALTER TABLE "server" DROP COLUMN IF EXISTS "thresholdMemory";
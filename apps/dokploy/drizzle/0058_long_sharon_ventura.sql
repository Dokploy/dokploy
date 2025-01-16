ALTER TABLE "admin" ALTER COLUMN "serverRefreshRateMetrics" SET DEFAULT 20;--> statement-breakpoint
ALTER TABLE "admin" ALTER COLUMN "containerRefreshRateMetrics" SET DEFAULT 20;--> statement-breakpoint
ALTER TABLE "server" ALTER COLUMN "serverRefreshRateMetrics" SET DEFAULT 20;--> statement-breakpoint
ALTER TABLE "server" ALTER COLUMN "containerRefreshRateMetrics" SET DEFAULT 20;
ALTER TABLE "cloud_server" ADD COLUMN "bandwidthBytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_server" ADD COLUMN "bandwidthMeasuredAt" text;
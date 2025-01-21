ALTER TABLE "admin" ADD COLUMN "cleanupCacheApplications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "cleanupCacheOnPreviews" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin" ADD COLUMN "cleanupCacheOnCompose" boolean DEFAULT false NOT NULL;
ALTER TABLE "application" ADD COLUMN "previewNoIndex" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "noIndex" boolean DEFAULT false NOT NULL;

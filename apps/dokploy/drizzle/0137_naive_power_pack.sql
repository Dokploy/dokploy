ALTER TABLE "user" ADD COLUMN "enableEnterpriseFeatures" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "licenseKey" text;
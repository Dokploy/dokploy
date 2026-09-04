ALTER TABLE "ai" ADD COLUMN "enableCodeInspection" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai" ADD COLUMN "logLineLimit" integer DEFAULT 200 NOT NULL;
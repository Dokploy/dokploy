ALTER TABLE "deployment" ADD COLUMN "qcRunId" text;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "qcStageStatus" jsonb;
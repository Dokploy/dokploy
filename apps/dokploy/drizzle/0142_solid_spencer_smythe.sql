ALTER TABLE "notification" ADD COLUMN "previewDeploy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "previewRebuild" boolean DEFAULT false NOT NULL;
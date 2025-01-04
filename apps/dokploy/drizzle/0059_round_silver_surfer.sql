ALTER TABLE "server" RENAME COLUMN "threshold" TO "thresholdCpu";--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "thresholdMemory" integer DEFAULT 0 NOT NULL;
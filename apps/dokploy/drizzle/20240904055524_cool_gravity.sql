ALTER TABLE "compose" ADD COLUMN "suffix" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "randomize" boolean DEFAULT false NOT NULL;
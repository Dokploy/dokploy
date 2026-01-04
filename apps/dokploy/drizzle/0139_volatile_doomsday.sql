ALTER TABLE "application" ADD COLUMN "tagPatterns" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "tagPatterns" text[] DEFAULT '{}';
ALTER TABLE "application" ADD COLUMN "enableLfs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "enableLfs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DROP TYPE "public"."composeType";--> statement-breakpoint
DROP TYPE "public"."sourceTypeCompose";
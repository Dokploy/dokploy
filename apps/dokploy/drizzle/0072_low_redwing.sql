ALTER TYPE "public"."sourceType" ADD VALUE 'gitea' BEFORE 'drop';--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "giteaProjectId" integer;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "giteaRepository" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "giteaOwner" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "giteaBranch" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "giteaBuildPath" text DEFAULT '/';--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "giteaPathNamespace" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "giteaId" text;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_giteaId_gitea_giteaId_fk" FOREIGN KEY ("giteaId") REFERENCES "public"."gitea"("giteaId") ON DELETE set null ON UPDATE no action;
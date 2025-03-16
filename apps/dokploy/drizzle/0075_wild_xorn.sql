ALTER TYPE "public"."sourceTypeCompose" ADD VALUE 'gitea' BEFORE 'raw';--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "giteaRepository" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "giteaOwner" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "giteaBranch" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "giteaId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD CONSTRAINT "compose_giteaId_gitea_giteaId_fk" FOREIGN KEY ("giteaId") REFERENCES "public"."gitea"("giteaId") ON DELETE set null ON UPDATE no action;
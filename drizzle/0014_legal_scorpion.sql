ALTER TABLE "compose" ALTER COLUMN "command" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "compose" DROP COLUMN IF EXISTS "buildPath";--> statement-breakpoint
ALTER TABLE "compose" DROP COLUMN IF EXISTS "customGitBuildPath";
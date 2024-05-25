DO $$ BEGIN
 CREATE TYPE "sourceTypeCompose" AS ENUM('git', 'github');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "refreshToken" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "sourceType" "sourceTypeCompose" DEFAULT 'github' NOT NULL;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "repository" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "owner" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "branch" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "buildPath" text DEFAULT '/';--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "autoDeploy" boolean;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "customGitUrl" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "customGitBranch" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "customGitBuildPath" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "customGitSSHKey" text;
DO $$ BEGIN
 CREATE TYPE "public"."composeType" AS ENUM('docker-compose', 'stack');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sourceTypeCompose" AS ENUM('git', 'github', 'raw');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "serviceType" ADD VALUE 'compose';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compose" (
	"composeId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"appName" text NOT NULL,
	"description" text,
	"env" text,
	"composeFile" text DEFAULT '' NOT NULL,
	"refreshToken" text,
	"sourceType" "sourceTypeCompose" DEFAULT 'github' NOT NULL,
	"composeType" "composeType" DEFAULT 'docker-compose' NOT NULL,
	"repository" text,
	"owner" text,
	"branch" text,
	"autoDeploy" boolean,
	"customGitUrl" text,
	"customGitBranch" text,
	"customGitSSHKey" text,
	"command" text DEFAULT '' NOT NULL,
	"composePath" text DEFAULT './docker-compose.yml' NOT NULL,
	"composeStatus" "applicationStatus" DEFAULT 'idle' NOT NULL,
	"projectId" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployment" ALTER COLUMN "applicationId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "composeId" text;--> statement-breakpoint
ALTER TABLE "mount" ADD COLUMN "composeId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compose" ADD CONSTRAINT "compose_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "public"."project"("projectId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployment" ADD CONSTRAINT "deployment_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mount" ADD CONSTRAINT "mount_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

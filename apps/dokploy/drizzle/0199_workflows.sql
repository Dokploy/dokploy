CREATE TYPE "public"."workflowRunStatus" AS ENUM('queued', 'running', 'success', 'failure', 'cancelled', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."workflowSecretType" AS ENUM('secret', 'variable');--> statement-breakpoint
ALTER TYPE "public"."serverType" ADD VALUE 'workflow';--> statement-breakpoint
CREATE TABLE "workflow_repository" (
	"workflowRepositoryId" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repository" text NOT NULL,
	"defaultBranch" text DEFAULT 'main' NOT NULL,
	"runDokployWorkflows" boolean DEFAULT true NOT NULL,
	"runGithubWorkflows" boolean DEFAULT false NOT NULL,
	"lastSyncedAt" text,
	"syncError" text,
	"createdAt" text NOT NULL,
	"githubId" text NOT NULL,
	"serverId" text,
	"organizationId" text NOT NULL,
	CONSTRAINT "workflow_repository_org_repo_unique" UNIQUE("organizationId","githubId","owner","repository")
);
--> statement-breakpoint
CREATE TABLE "workflow_run" (
	"workflowRunId" text PRIMARY KEY NOT NULL,
	"runNumber" integer NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"workflowPath" text NOT NULL,
	"workflowName" text NOT NULL,
	"event" text NOT NULL,
	"eventAction" text,
	"ref" text NOT NULL,
	"branch" text,
	"sha" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"actor" text,
	"pullRequestNumber" integer,
	"payload" jsonb NOT NULL,
	"inputs" jsonb,
	"targetJob" text,
	"status" "workflowRunStatus" DEFAULT 'queued' NOT NULL,
	"exitCode" integer,
	"errorMessage" text,
	"logPath" text,
	"checkRunId" text,
	"cancelRequested" boolean DEFAULT false NOT NULL,
	"createdAt" text NOT NULL,
	"startedAt" text,
	"finishedAt" text,
	"workflowId" text,
	"workflowRepositoryId" text NOT NULL,
	"serverId" text
);
--> statement-breakpoint
CREATE TABLE "workflow_secret" (
	"workflowSecretId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"value" text NOT NULL,
	"type" "workflowSecretType" DEFAULT 'secret' NOT NULL,
	"createdAt" text NOT NULL,
	"workflowRepositoryId" text NOT NULL,
	CONSTRAINT "workflow_secret_name_unique" UNIQUE("workflowRepositoryId","type","name")
);
--> statement-breakpoint
CREATE TABLE "workflow" (
	"workflowId" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"triggers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"jobs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dispatchInputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parseError" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"workflowRepositoryId" text NOT NULL,
	CONSTRAINT "workflow_repository_path_unique" UNIQUE("workflowRepositoryId","path")
);
--> statement-breakpoint
ALTER TABLE "webServerSettings" ALTER COLUMN "whitelabelingConfig" SET DEFAULT '{"appName":null,"appDescription":null,"logoUrl":null,"faviconUrl":null,"customCss":null,"loginLogoUrl":null,"supportUrl":null,"docsUrl":null,"errorPageTitle":null,"errorPageDescription":null,"footerText":null,"ogImageUrl":null,"passwordResetGuide":null,"supportEmail":null,"logoLightUrl":null,"loginLogoLightUrl":null,"faviconLightUrl":null,"dualModeBranding":false}'::jsonb;--> statement-breakpoint
ALTER TABLE "workflow_repository" ADD CONSTRAINT "workflow_repository_githubId_github_githubId_fk" FOREIGN KEY ("githubId") REFERENCES "public"."github"("githubId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_repository" ADD CONSTRAINT "workflow_repository_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_repository" ADD CONSTRAINT "workflow_repository_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_workflowId_workflow_workflowId_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflow"("workflowId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_workflowRepositoryId_workflow_repository_workflowRepositoryId_fk" FOREIGN KEY ("workflowRepositoryId") REFERENCES "public"."workflow_repository"("workflowRepositoryId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_secret" ADD CONSTRAINT "workflow_secret_workflowRepositoryId_workflow_repository_workflowRepositoryId_fk" FOREIGN KEY ("workflowRepositoryId") REFERENCES "public"."workflow_repository"("workflowRepositoryId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_workflowRepositoryId_workflow_repository_workflowRepositoryId_fk" FOREIGN KEY ("workflowRepositoryId") REFERENCES "public"."workflow_repository"("workflowRepositoryId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_run_repository_idx" ON "workflow_run" USING btree ("workflowRepositoryId","createdAt");--> statement-breakpoint
CREATE INDEX "workflow_run_status_idx" ON "workflow_run" USING btree ("status");
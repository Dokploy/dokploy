ALTER TYPE "domainType" ADD VALUE 'preview';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "preview_deployments" (
	"previewDeploymentId" text PRIMARY KEY NOT NULL,
	"branch" text NOT NULL,
	"pullRequestId" text NOT NULL,
	"pullRequestNumber" text NOT NULL,
	"pullRequestURL" text NOT NULL,
	"pullRequestTitle" text NOT NULL,
	"pullRequestCommentId" text NOT NULL,
	"previewStatus" "applicationStatus" DEFAULT 'idle' NOT NULL,
	"appName" text NOT NULL,
	"applicationId" text NOT NULL,
	"domainId" text,
	"createdAt" text NOT NULL,
	"expiresAt" text,
	CONSTRAINT "preview_deployments_appName_unique" UNIQUE("appName")
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "previewEnv" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "previewBuildArgs" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "previewWildcard" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "previewPort" integer DEFAULT 3000;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "previewHttps" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "previewPath" text DEFAULT '/';--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "certificateType" "certificateType" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "previewLimit" integer DEFAULT 3;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "isPreviewDeploymentsActive" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "previewDeploymentId" text;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "isPreviewDeployment" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "previewDeploymentId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "preview_deployments" ADD CONSTRAINT "preview_deployments_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("applicationId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "preview_deployments" ADD CONSTRAINT "preview_deployments_domainId_domain_domainId_fk" FOREIGN KEY ("domainId") REFERENCES "public"."domain"("domainId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "domain" ADD CONSTRAINT "domain_previewDeploymentId_preview_deployments_previewDeploymentId_fk" FOREIGN KEY ("previewDeploymentId") REFERENCES "public"."preview_deployments"("previewDeploymentId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployment" ADD CONSTRAINT "deployment_previewDeploymentId_preview_deployments_previewDeploymentId_fk" FOREIGN KEY ("previewDeploymentId") REFERENCES "public"."preview_deployments"("previewDeploymentId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

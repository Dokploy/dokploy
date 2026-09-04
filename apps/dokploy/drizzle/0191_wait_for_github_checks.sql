CREATE TABLE "pending_github_deployments" (
	"pendingGithubDeploymentId" text PRIMARY KEY NOT NULL,
	"headSha" text NOT NULL,
	"titleLog" text NOT NULL,
	"descriptionLog" text NOT NULL,
	"applicationId" text,
	"composeId" text,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "waitForChecks" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "waitForChecks" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_github_deployments" ADD CONSTRAINT "pending_github_deployments_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("applicationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_github_deployments" ADD CONSTRAINT "pending_github_deployments_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pending_github_deployments_applicationId_idx" ON "pending_github_deployments" USING btree ("applicationId");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_github_deployments_composeId_idx" ON "pending_github_deployments" USING btree ("composeId");
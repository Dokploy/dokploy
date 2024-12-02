ALTER TABLE "preview_deployments" DROP CONSTRAINT "preview_deployments_deploymentId_deployment_deploymentId_fk";
--> statement-breakpoint
ALTER TABLE "preview_deployments" DROP COLUMN IF EXISTS "deploymentId";
ALTER TABLE "rollback" DROP CONSTRAINT "rollback_deploymentId_deployment_deploymentId_fk";
--> statement-breakpoint
ALTER TABLE "rollback" ADD CONSTRAINT "rollback_deploymentId_deployment_deploymentId_fk" FOREIGN KEY ("deploymentId") REFERENCES "public"."deployment"("deploymentId") ON DELETE cascade ON UPDATE no action;
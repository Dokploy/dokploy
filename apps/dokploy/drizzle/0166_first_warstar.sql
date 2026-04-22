ALTER TABLE "preview_deployments" ALTER COLUMN "pullRequestCommentId" SET DEFAULT '';--> statement-breakpoint
DELETE FROM "preview_deployments" t1
USING "preview_deployments" t2
WHERE t1."applicationId" = t2."applicationId"
  AND t1."pullRequestId" = t2."pullRequestId"
  AND t1."createdAt" > t2."createdAt";--> statement-breakpoint
CREATE UNIQUE INDEX "preview_deployments_application_pr_unique" ON "preview_deployments" USING btree ("applicationId","pullRequestId");

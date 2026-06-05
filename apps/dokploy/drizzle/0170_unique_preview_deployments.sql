-- Remove duplicate preview deployments before enforcing uniqueness.
-- Existing installations may already contain duplicates (e.g. created by the
-- concurrent `opened` + `labeled` webhooks GitHub fires), so the oldest preview
-- deployment per (applicationId, pullRequestId) pair is kept and the rest dropped.
DELETE FROM "preview_deployments"
WHERE "previewDeploymentId" IN (
	SELECT "previewDeploymentId"
	FROM (
		SELECT
			"previewDeploymentId",
			ROW_NUMBER() OVER (
				PARTITION BY "applicationId", "pullRequestId"
				ORDER BY "createdAt" ASC, "previewDeploymentId" ASC
			) AS rn
		FROM "preview_deployments"
	) ranked
	WHERE ranked.rn > 1
);--> statement-breakpoint
ALTER TABLE "preview_deployments" ADD CONSTRAINT "preview_deployments_applicationId_pullRequestId_unique" UNIQUE("applicationId","pullRequestId");

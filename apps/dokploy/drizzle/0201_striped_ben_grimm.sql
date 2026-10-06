CREATE TABLE "test_plan_history" (
	"testPlanHistoryId" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"branch" text NOT NULL,
	"version" integer NOT NULL,
	"commitSha" text,
	"qcRunId" text,
	"content" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_plan_history" ADD CONSTRAINT "test_plan_history_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("applicationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "test_plan_history_version_idx" ON "test_plan_history" USING btree ("applicationId","branch","version");--> statement-breakpoint
CREATE INDEX "test_plan_history_application_idx" ON "test_plan_history" USING btree ("applicationId","createdAt");--> statement-breakpoint
-- The plan each application holds today becomes its first history entry, so it
-- isn't lost when the next one replaces it. The commit isn't known for these.
INSERT INTO "test_plan_history" ("testPlanHistoryId", "applicationId", "branch", "version", "content", "createdAt")
SELECT 'bf_' || "applicationId", "applicationId", COALESCE(NULLIF("customGitBranch", ''), NULLIF("branch", ''), 'main'), "testPlanVersion", "testPlanContent", to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM "application"
WHERE "testPlanContent" IS NOT NULL AND "testPlanVersion" > 0
ON CONFLICT DO NOTHING;

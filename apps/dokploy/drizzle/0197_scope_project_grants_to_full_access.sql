-- A project in "accesedProjects" now grants every service it contains, now and in
-- future. Until this release the dialog auto-added the parent project whenever a
-- single service was ticked, so a row can mean either "some services here" or a
-- deliberate project-level grant, and the two need opposite treatment.
--
-- The discriminator is whether the member holds any service inside it:
--   * holds SOME but not all -> the row is an auto-added parent. Drop it, or the
--     member silently gains the siblings. Nothing is lost: visibility is now
--     derived from the services they keep.
--   * holds ALL of them      -> already equivalent to full access. Keep.
--   * holds NONE of them     -> the row can only have come from ticking the
--     project or environment itself, so it is a deliberate grant. Keep it;
--     dropping it would revoke the project from someone who never had a service
--     grant to derive visibility from.
-- A project or environment containing no services at all satisfies both "all" and
-- "none" vacuously and is kept.
WITH svc AS (
	SELECT "applicationId" AS "serviceId", "environmentId" FROM "application"
	UNION ALL SELECT "composeId", "environmentId" FROM "compose"
	UNION ALL SELECT "libsqlId", "environmentId" FROM "libsql"
	UNION ALL SELECT "mariadbId", "environmentId" FROM "mariadb"
	UNION ALL SELECT "mongoId", "environmentId" FROM "mongo"
	UNION ALL SELECT "mysqlId", "environmentId" FROM "mysql"
	UNION ALL SELECT "postgresId", "environmentId" FROM "postgres"
	UNION ALL SELECT "redisId", "environmentId" FROM "redis"
),
project_services AS (
	SELECT e."projectId", svc."serviceId"
	FROM "environment" e
	JOIN svc ON svc."environmentId" = e."environmentId"
)
UPDATE "member" m
SET "accesedProjects" = ARRAY(
	SELECT p
	FROM unnest(m."accesedProjects") AS p
	WHERE NOT EXISTS (
		SELECT 1 FROM project_services ps
		WHERE ps."projectId" = p
			AND NOT (ps."serviceId" = ANY(m."accesedServices"))
	)
	OR NOT EXISTS (
		SELECT 1 FROM project_services ps
		WHERE ps."projectId" = p
			AND ps."serviceId" = ANY(m."accesedServices")
	)
)
WHERE m."role" NOT IN ('owner', 'admin');
--> statement-breakpoint
WITH svc AS (
	SELECT "applicationId" AS "serviceId", "environmentId" FROM "application"
	UNION ALL SELECT "composeId", "environmentId" FROM "compose"
	UNION ALL SELECT "libsqlId", "environmentId" FROM "libsql"
	UNION ALL SELECT "mariadbId", "environmentId" FROM "mariadb"
	UNION ALL SELECT "mongoId", "environmentId" FROM "mongo"
	UNION ALL SELECT "mysqlId", "environmentId" FROM "mysql"
	UNION ALL SELECT "postgresId", "environmentId" FROM "postgres"
	UNION ALL SELECT "redisId", "environmentId" FROM "redis"
)
UPDATE "member" m
SET "accessedEnvironments" = ARRAY(
	SELECT e
	FROM unnest(m."accessedEnvironments") AS e
	WHERE NOT EXISTS (
		SELECT 1 FROM svc
		WHERE svc."environmentId" = e
			AND NOT (svc."serviceId" = ANY(m."accesedServices"))
	)
	OR NOT EXISTS (
		SELECT 1 FROM svc
		WHERE svc."environmentId" = e
			AND svc."serviceId" = ANY(m."accesedServices")
	)
)
WHERE m."role" NOT IN ('owner', 'admin');

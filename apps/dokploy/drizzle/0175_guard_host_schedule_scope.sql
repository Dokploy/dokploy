WITH ambiguous_owner_orgs AS (
	SELECT DISTINCT m."organization_id"
	FROM "member" m
	INNER JOIN (
		SELECT "user_id"
		FROM "member"
		WHERE "role" = 'owner'
		GROUP BY "user_id"
		HAVING count(DISTINCT "organization_id") > 1
	) ambiguous_owner ON ambiguous_owner."user_id" = m."user_id"
	WHERE m."role" = 'owner'
)
UPDATE "schedule" s
SET "enabled" = false
FROM ambiguous_owner_orgs
WHERE s."scheduleType" = 'dokploy-server'
  AND s."organizationId" = ambiguous_owner_orgs."organization_id";--> statement-breakpoint
UPDATE "schedule"
SET "enabled" = false
WHERE "scheduleType" = 'dokploy-server'
  AND "organizationId" IS NULL;

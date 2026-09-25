WITH "duplicate_team_names" AS (
	SELECT "id", row_number() OVER (
		PARTITION BY "organization_id", "name"
		ORDER BY "created_at", "id"
	) AS "position"
	FROM "team"
)
UPDATE "team"
SET "name" = "team"."name" || ' (' || "team"."id" || ')'
FROM "duplicate_team_names"
WHERE "team"."id" = "duplicate_team_names"."id"
	AND "duplicate_team_names"."position" > 1;
--> statement-breakpoint
DROP INDEX IF EXISTS "team_name_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_organization_name_unique" ON "team" USING btree ("organization_id","name");

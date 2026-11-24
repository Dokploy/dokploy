ALTER TABLE "backup" DROP CONSTRAINT "backup_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "assignedTo" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "assignedTo" text;--> statement-breakpoint
ALTER TABLE "environment" ADD COLUMN "assignedTo" text;--> statement-breakpoint
ALTER TABLE "libsql" ADD COLUMN "assignedTo" text;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "assignedTo" text;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "assignedTo" text;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "assignedTo" text;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "assignedTo" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "assignedTo" text;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "assignedTo" text;--> statement-breakpoint
ALTER TABLE "backup" ADD CONSTRAINT "backup_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Assign existing projects, environments and services to whoever created them.
-- First the audit log (exact), then the access lists: creating something always
-- appends it to the creator's list, so an item listed for exactly one member of its
-- organization was created by that member. Anything else stays unassigned.
UPDATE "project" t
SET "assignedTo" = a."user_id"
FROM (
	SELECT DISTINCT ON ("resource_id") "resource_id", "user_id", "organization_id"
	FROM "audit_log"
	WHERE "action" = 'create' AND "resource_type" IN ('project') AND "user_id" IS NOT NULL
	ORDER BY "resource_id", "created_at"
) a
WHERE t."assignedTo" IS NULL AND t."projectId" = a."resource_id"
	AND t."organizationId" = a."organization_id";--> statement-breakpoint
UPDATE "project" t
SET "assignedTo" = c."userId"
FROM (
	SELECT m."organization_id" AS org, x."id" AS id, min(m."user_id") AS "userId"
	FROM "member" m
	CROSS JOIN LATERAL unnest(m."accesedProjects") AS x("id")
	GROUP BY m."organization_id", x."id"
	HAVING count(*) = 1
) c
WHERE t."assignedTo" IS NULL AND t."projectId" = c.id
	AND t."organizationId" = c.org;--> statement-breakpoint
UPDATE "environment" t
SET "assignedTo" = a."user_id"
FROM (
	SELECT DISTINCT ON ("resource_id") "resource_id", "user_id", "organization_id"
	FROM "audit_log"
	WHERE "action" = 'create' AND "resource_type" IN ('environment') AND "user_id" IS NOT NULL
	ORDER BY "resource_id", "created_at"
) a, "project" p
WHERE t."assignedTo" IS NULL AND t."environmentId" = a."resource_id"
	AND t."projectId" = p."projectId" AND p."organizationId" = a."organization_id";--> statement-breakpoint
UPDATE "environment" t
SET "assignedTo" = c."userId"
FROM (
	SELECT m."organization_id" AS org, x."id" AS id, min(m."user_id") AS "userId"
	FROM "member" m
	CROSS JOIN LATERAL unnest(m."accessedEnvironments") AS x("id")
	GROUP BY m."organization_id", x."id"
	HAVING count(*) = 1
) c, "project" p
WHERE t."assignedTo" IS NULL AND t."environmentId" = c.id
	AND t."projectId" = p."projectId" AND p."organizationId" = c.org;--> statement-breakpoint
-- A default environment is created together with its project.
UPDATE "environment" t
SET "assignedTo" = p."assignedTo"
FROM "project" p
WHERE t."assignedTo" IS NULL AND t."isDefault" = true AND t."projectId" = p."projectId";--> statement-breakpoint
UPDATE "application" t
SET "assignedTo" = a."user_id"
FROM (
	SELECT DISTINCT ON ("resource_id") "resource_id", "user_id", "organization_id"
	FROM "audit_log"
	WHERE "action" = 'create' AND "resource_type" IN ('service', 'compose') AND "user_id" IS NOT NULL
	ORDER BY "resource_id", "created_at"
) a, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."applicationId" = a."resource_id"
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = a."organization_id";--> statement-breakpoint
UPDATE "application" t
SET "assignedTo" = c."userId"
FROM (
	SELECT m."organization_id" AS org, x."id" AS id, min(m."user_id") AS "userId"
	FROM "member" m
	CROSS JOIN LATERAL unnest(m."accesedServices") AS x("id")
	GROUP BY m."organization_id", x."id"
	HAVING count(*) = 1
) c, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."applicationId" = c.id
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = c.org;--> statement-breakpoint
UPDATE "compose" t
SET "assignedTo" = a."user_id"
FROM (
	SELECT DISTINCT ON ("resource_id") "resource_id", "user_id", "organization_id"
	FROM "audit_log"
	WHERE "action" = 'create' AND "resource_type" IN ('service', 'compose') AND "user_id" IS NOT NULL
	ORDER BY "resource_id", "created_at"
) a, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."composeId" = a."resource_id"
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = a."organization_id";--> statement-breakpoint
UPDATE "compose" t
SET "assignedTo" = c."userId"
FROM (
	SELECT m."organization_id" AS org, x."id" AS id, min(m."user_id") AS "userId"
	FROM "member" m
	CROSS JOIN LATERAL unnest(m."accesedServices") AS x("id")
	GROUP BY m."organization_id", x."id"
	HAVING count(*) = 1
) c, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."composeId" = c.id
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = c.org;--> statement-breakpoint
UPDATE "postgres" t
SET "assignedTo" = a."user_id"
FROM (
	SELECT DISTINCT ON ("resource_id") "resource_id", "user_id", "organization_id"
	FROM "audit_log"
	WHERE "action" = 'create' AND "resource_type" IN ('service', 'compose') AND "user_id" IS NOT NULL
	ORDER BY "resource_id", "created_at"
) a, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."postgresId" = a."resource_id"
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = a."organization_id";--> statement-breakpoint
UPDATE "postgres" t
SET "assignedTo" = c."userId"
FROM (
	SELECT m."organization_id" AS org, x."id" AS id, min(m."user_id") AS "userId"
	FROM "member" m
	CROSS JOIN LATERAL unnest(m."accesedServices") AS x("id")
	GROUP BY m."organization_id", x."id"
	HAVING count(*) = 1
) c, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."postgresId" = c.id
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = c.org;--> statement-breakpoint
UPDATE "mysql" t
SET "assignedTo" = a."user_id"
FROM (
	SELECT DISTINCT ON ("resource_id") "resource_id", "user_id", "organization_id"
	FROM "audit_log"
	WHERE "action" = 'create' AND "resource_type" IN ('service', 'compose') AND "user_id" IS NOT NULL
	ORDER BY "resource_id", "created_at"
) a, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."mysqlId" = a."resource_id"
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = a."organization_id";--> statement-breakpoint
UPDATE "mysql" t
SET "assignedTo" = c."userId"
FROM (
	SELECT m."organization_id" AS org, x."id" AS id, min(m."user_id") AS "userId"
	FROM "member" m
	CROSS JOIN LATERAL unnest(m."accesedServices") AS x("id")
	GROUP BY m."organization_id", x."id"
	HAVING count(*) = 1
) c, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."mysqlId" = c.id
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = c.org;--> statement-breakpoint
UPDATE "mariadb" t
SET "assignedTo" = a."user_id"
FROM (
	SELECT DISTINCT ON ("resource_id") "resource_id", "user_id", "organization_id"
	FROM "audit_log"
	WHERE "action" = 'create' AND "resource_type" IN ('service', 'compose') AND "user_id" IS NOT NULL
	ORDER BY "resource_id", "created_at"
) a, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."mariadbId" = a."resource_id"
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = a."organization_id";--> statement-breakpoint
UPDATE "mariadb" t
SET "assignedTo" = c."userId"
FROM (
	SELECT m."organization_id" AS org, x."id" AS id, min(m."user_id") AS "userId"
	FROM "member" m
	CROSS JOIN LATERAL unnest(m."accesedServices") AS x("id")
	GROUP BY m."organization_id", x."id"
	HAVING count(*) = 1
) c, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."mariadbId" = c.id
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = c.org;--> statement-breakpoint
UPDATE "mongo" t
SET "assignedTo" = a."user_id"
FROM (
	SELECT DISTINCT ON ("resource_id") "resource_id", "user_id", "organization_id"
	FROM "audit_log"
	WHERE "action" = 'create' AND "resource_type" IN ('service', 'compose') AND "user_id" IS NOT NULL
	ORDER BY "resource_id", "created_at"
) a, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."mongoId" = a."resource_id"
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = a."organization_id";--> statement-breakpoint
UPDATE "mongo" t
SET "assignedTo" = c."userId"
FROM (
	SELECT m."organization_id" AS org, x."id" AS id, min(m."user_id") AS "userId"
	FROM "member" m
	CROSS JOIN LATERAL unnest(m."accesedServices") AS x("id")
	GROUP BY m."organization_id", x."id"
	HAVING count(*) = 1
) c, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."mongoId" = c.id
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = c.org;--> statement-breakpoint
UPDATE "redis" t
SET "assignedTo" = a."user_id"
FROM (
	SELECT DISTINCT ON ("resource_id") "resource_id", "user_id", "organization_id"
	FROM "audit_log"
	WHERE "action" = 'create' AND "resource_type" IN ('service', 'compose') AND "user_id" IS NOT NULL
	ORDER BY "resource_id", "created_at"
) a, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."redisId" = a."resource_id"
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = a."organization_id";--> statement-breakpoint
UPDATE "redis" t
SET "assignedTo" = c."userId"
FROM (
	SELECT m."organization_id" AS org, x."id" AS id, min(m."user_id") AS "userId"
	FROM "member" m
	CROSS JOIN LATERAL unnest(m."accesedServices") AS x("id")
	GROUP BY m."organization_id", x."id"
	HAVING count(*) = 1
) c, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."redisId" = c.id
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = c.org;--> statement-breakpoint
UPDATE "libsql" t
SET "assignedTo" = a."user_id"
FROM (
	SELECT DISTINCT ON ("resource_id") "resource_id", "user_id", "organization_id"
	FROM "audit_log"
	WHERE "action" = 'create' AND "resource_type" IN ('service', 'compose') AND "user_id" IS NOT NULL
	ORDER BY "resource_id", "created_at"
) a, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."libsqlId" = a."resource_id"
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = a."organization_id";--> statement-breakpoint
UPDATE "libsql" t
SET "assignedTo" = c."userId"
FROM (
	SELECT m."organization_id" AS org, x."id" AS id, min(m."user_id") AS "userId"
	FROM "member" m
	CROSS JOIN LATERAL unnest(m."accesedServices") AS x("id")
	GROUP BY m."organization_id", x."id"
	HAVING count(*) = 1
) c, "environment" e, "project" p
WHERE t."assignedTo" IS NULL AND t."libsqlId" = c.id
	AND t."environmentId" = e."environmentId" AND e."projectId" = p."projectId"
	AND p."organizationId" = c.org;

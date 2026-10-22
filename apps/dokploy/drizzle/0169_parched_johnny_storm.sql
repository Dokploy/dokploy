ALTER TABLE "schedule" DROP CONSTRAINT "schedule_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "schedule" s
SET "organizationId" = m."organization_id"
FROM "member" m
WHERE s."scheduleType" = 'dokploy-server'
  AND s."userId" = m."user_id"
  AND m."role" = 'owner';--> statement-breakpoint
ALTER TABLE "schedule" DROP COLUMN "userId";

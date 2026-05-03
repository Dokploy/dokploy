ALTER TABLE "cloudflare_config" ADD COLUMN "accounts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "tunnelAccountId" text;--> statement-breakpoint
UPDATE "cloudflare_config"
SET "accounts" = jsonb_build_array(
    jsonb_build_object('id', "accountId", 'name', COALESCE("accountName", "accountId"))
)
WHERE "accountId" IS NOT NULL;--> statement-breakpoint
UPDATE "server" s
SET "tunnelAccountId" = c."accountId"
FROM "cloudflare_config" c
WHERE s."organizationId" = c."organizationId"
  AND s."tunnelId" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "cloudflare_config" DROP COLUMN "accountId";--> statement-breakpoint
ALTER TABLE "cloudflare_config" DROP COLUMN "accountName";

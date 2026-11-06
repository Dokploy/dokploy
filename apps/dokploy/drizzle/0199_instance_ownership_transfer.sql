ALTER TABLE "webServerSettings" ALTER COLUMN "whitelabelingConfig" SET DEFAULT '{"appName":null,"appDescription":null,"logoUrl":null,"faviconUrl":null,"customCss":null,"loginLogoUrl":null,"supportUrl":null,"docsUrl":null,"errorPageTitle":null,"errorPageDescription":null,"footerText":null,"ogImageUrl":null,"passwordResetGuide":null,"supportEmail":null,"logoLightUrl":null,"loginLogoLightUrl":null,"faviconLightUrl":null,"dualModeBranding":false}'::jsonb;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "instanceOwnerId" text;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "pendingOwnerId" text;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "pendingOwnerExpiresAt" timestamp;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD CONSTRAINT "webServerSettings_instanceOwnerId_user_id_fk" FOREIGN KEY ("instanceOwnerId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD CONSTRAINT "webServerSettings_pendingOwnerId_user_id_fk" FOREIGN KEY ("pendingOwnerId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "webServerSettings" SET "instanceOwnerId" = (
	SELECT "member"."user_id" FROM "member"
	INNER JOIN "user" ON "user"."id" = "member"."user_id"
	WHERE "member"."role" = 'owner'
	ORDER BY "user"."createdAt" ASC LIMIT 1
) WHERE "instanceOwnerId" IS NULL;
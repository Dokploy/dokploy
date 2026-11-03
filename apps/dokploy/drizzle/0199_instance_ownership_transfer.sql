CREATE TABLE "ownership_transfer" (
	"id" text PRIMARY KEY NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webServerSettings" ALTER COLUMN "whitelabelingConfig" SET DEFAULT '{"appName":null,"appDescription":null,"logoUrl":null,"faviconUrl":null,"customCss":null,"loginLogoUrl":null,"supportUrl":null,"docsUrl":null,"errorPageTitle":null,"errorPageDescription":null,"footerText":null,"ogImageUrl":null,"passwordResetGuide":null,"supportEmail":null,"logoLightUrl":null,"loginLogoLightUrl":null,"faviconLightUrl":null,"dualModeBranding":false}'::jsonb;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "instanceOwnerId" text;--> statement-breakpoint
ALTER TABLE "ownership_transfer" ADD CONSTRAINT "ownership_transfer_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_transfer" ADD CONSTRAINT "ownership_transfer_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ownershipTransfer_toUserId_idx" ON "ownership_transfer" USING btree ("to_user_id");--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD CONSTRAINT "webServerSettings_instanceOwnerId_user_id_fk" FOREIGN KEY ("instanceOwnerId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "webServerSettings" SET "instanceOwnerId" = (
	SELECT "member"."user_id" FROM "member"
	INNER JOIN "user" ON "user"."id" = "member"."user_id"
	WHERE "member"."role" = 'owner'
	ORDER BY "user"."createdAt" ASC LIMIT 1
) WHERE "instanceOwnerId" IS NULL;
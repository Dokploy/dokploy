CREATE TABLE "forward_auth_settings" (
	"forwardAuthSettingsId" text PRIMARY KEY NOT NULL,
	"authDomain" text NOT NULL,
	"baseDomain" text NOT NULL,
	"https" boolean DEFAULT true NOT NULL,
	"certificateType" "certificateType" DEFAULT 'letsencrypt' NOT NULL,
	"customCertResolver" text,
	"providerId" text,
	"serverId" text,
	"createdAt" text NOT NULL,
	CONSTRAINT "forward_auth_settings_serverId_unique" UNIQUE("serverId")
);
--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "forwardAuthEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "forward_auth_settings" ADD CONSTRAINT "forward_auth_settings_providerId_sso_provider_provider_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."sso_provider"("provider_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forward_auth_settings" ADD CONSTRAINT "forward_auth_settings_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
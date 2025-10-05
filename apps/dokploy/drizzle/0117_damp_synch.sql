CREATE TABLE "oidc_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"provider_id" text NOT NULL,
	"display_name" text DEFAULT 'OpenID Connect' NOT NULL,
	"domain" text,
	"issuer" text NOT NULL,
	"discovery_url" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"scopes" text[] DEFAULT '{"openid","email","profile"}' NOT NULL,
	"pkce" boolean DEFAULT true NOT NULL,
	"override_user_info" boolean DEFAULT false NOT NULL,
	"mapping" jsonb DEFAULT '{"id":"sub","email":"email","emailVerified":"email_verified","name":"name","image":"picture"}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_settings_provider_id_unq" ON "oidc_settings" USING btree ("provider_id");
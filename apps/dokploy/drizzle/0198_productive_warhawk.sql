CREATE TYPE "public"."sandboxNetworkMode" AS ENUM('isolated', 'internet');--> statement-breakpoint
CREATE TYPE "public"."sandboxStatus" AS ENUM('creating', 'running', 'killed', 'error');--> statement-breakpoint
CREATE TABLE "sandbox" (
	"sandboxId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organizationId" text NOT NULL,
	"serverId" text,
	"image" text NOT NULL,
	"template" text,
	"containerId" text,
	"status" "sandboxStatus" DEFAULT 'creating' NOT NULL,
	"cpu" real DEFAULT 1 NOT NULL,
	"memoryMb" integer DEFAULT 512 NOT NULL,
	"pidsLimit" integer DEFAULT 256 NOT NULL,
	"timeoutMs" integer DEFAULT 300000 NOT NULL,
	"expiresAt" timestamp with time zone,
	"deadlineAt" timestamp with time zone NOT NULL,
	"lastActivityAt" timestamp with time zone,
	"networkMode" "sandboxNetworkMode" DEFAULT 'isolated' NOT NULL,
	"envVars" text,
	"workdir" text DEFAULT '/home/user' NOT NULL,
	"user" text,
	"runtime" text,
	"createdAt" text NOT NULL,
	"killedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "webServerSettings" ALTER COLUMN "whitelabelingConfig" SET DEFAULT '{"appName":null,"appDescription":null,"logoUrl":null,"faviconUrl":null,"customCss":null,"loginLogoUrl":null,"supportUrl":null,"docsUrl":null,"errorPageTitle":null,"errorPageDescription":null,"footerText":null,"ogImageUrl":null,"logoLightUrl":null,"loginLogoLightUrl":null,"faviconLightUrl":null,"dualModeBranding":false}'::jsonb;--> statement-breakpoint
ALTER TABLE "sandbox" ADD CONSTRAINT "sandbox_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox" ADD CONSTRAINT "sandbox_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
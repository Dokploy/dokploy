CREATE TYPE "public"."RegistryAuthType" AS ENUM('credentials', 'credential-helper');--> statement-breakpoint
ALTER TABLE "registry" ALTER COLUMN "username" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "registry" ALTER COLUMN "password" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "registry" ADD COLUMN "authType" "RegistryAuthType" DEFAULT 'credentials' NOT NULL;--> statement-breakpoint
ALTER TABLE "registry" ADD COLUMN "credentialHelper" text;--> statement-breakpoint
ALTER TABLE "registry" ADD COLUMN "credentialHelperUrls" text;
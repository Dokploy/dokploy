ALTER TYPE "public"."RegistryType" ADD VALUE 'awsEcr';--> statement-breakpoint
ALTER TABLE "registry" ADD COLUMN "awsAccessKeyId" text;--> statement-breakpoint
ALTER TABLE "registry" ADD COLUMN "awsSecretAccessKey" text;--> statement-breakpoint
ALTER TABLE "registry" ADD COLUMN "awsRegion" text;
ALTER TYPE "public"."RegistryType" ADD VALUE 'awsEcr';--> statement-breakpoint
ALTER TABLE "registry" ADD COLUMN "awsAccessKeyId" text;--> statement-breakpoint
ALTER TABLE "registry" ADD COLUMN "awsSecretAccessKey" text;--> statement-breakpoint
ALTER TABLE "registry" ADD COLUMN "awsRegion" text;--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "accessedGitProviders";--> statement-breakpoint
ALTER TABLE "git_provider" DROP COLUMN "sharedWithOrganization";--> statement-breakpoint
ALTER TABLE "notification" DROP COLUMN "dokployBackup";
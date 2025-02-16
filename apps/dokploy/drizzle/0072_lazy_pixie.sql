ALTER TABLE "project" DROP CONSTRAINT "project_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "destination" DROP CONSTRAINT "destination_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "certificate" DROP CONSTRAINT "certificate_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "registry" DROP CONSTRAINT "registry_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "ssh-key" DROP CONSTRAINT "ssh-key_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "git_provider" DROP CONSTRAINT "git_provider_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "server" DROP CONSTRAINT "server_userId_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "certificate" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "registry" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ssh-key" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "git_provider" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ALTER COLUMN "organizationId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "destination" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "certificate" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "registry" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "notification" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "ssh-key" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "git_provider" DROP COLUMN "userId";--> statement-breakpoint
ALTER TABLE "server" DROP COLUMN "userId";
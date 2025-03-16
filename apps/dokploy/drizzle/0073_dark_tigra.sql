ALTER TABLE "gitea" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "gitea" ADD COLUMN "client_secret" text;--> statement-breakpoint
ALTER TABLE "gitea" DROP COLUMN "application_id";--> statement-breakpoint
ALTER TABLE "gitea" DROP COLUMN "secret";--> statement-breakpoint
ALTER TABLE "gitea" DROP COLUMN "refresh_token";--> statement-breakpoint
ALTER TABLE "gitea" DROP COLUMN "organization_name";
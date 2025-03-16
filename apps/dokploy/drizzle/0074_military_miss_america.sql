ALTER TABLE "gitea" ADD COLUMN "refresh_token" text;--> statement-breakpoint
ALTER TABLE "gitea" ADD COLUMN "organization_name" text;--> statement-breakpoint
ALTER TABLE "gitea" ADD COLUMN "scopes" text;--> statement-breakpoint
ALTER TABLE "gitea" ADD COLUMN "last_authenticated_at" integer;
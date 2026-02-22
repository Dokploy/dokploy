ALTER TABLE "application" ADD COLUMN "networkIds" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "networkIds" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "networkIds" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "networkIds" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "networkIds" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "networkIds" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "networkIds" text[] DEFAULT '{}';
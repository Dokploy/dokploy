ALTER TABLE "application" ADD COLUMN "pidsLimit" text;--> statement-breakpoint
ALTER TABLE "libsql" ADD COLUMN "pidsLimit" text;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "pidsLimit" text;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "pidsLimit" text;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "pidsLimit" text;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "pidsLimit" text;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "pidsLimit" text;
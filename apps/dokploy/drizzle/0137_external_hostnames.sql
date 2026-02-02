ALTER TABLE "postgres" ADD COLUMN "externalHost" text;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "externalHost" text;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "externalHost" text;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "externalHost" text;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "externalHost" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "externalHost" text;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "externalHost" text;

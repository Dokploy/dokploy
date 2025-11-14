ALTER TABLE "application" ADD COLUMN "stopGracePeriodSwarm" bigint;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "stopGracePeriodSwarm" bigint;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "stopGracePeriodSwarm" bigint;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "stopGracePeriodSwarm" bigint;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "stopGracePeriodSwarm" bigint;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "stopGracePeriodSwarm" bigint;
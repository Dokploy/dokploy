ALTER TABLE "application" ADD COLUMN "ulimitsSwarm" json;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "ulimitsSwarm" json;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "ulimitsSwarm" json;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "ulimitsSwarm" json;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "ulimitsSwarm" json;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "ulimitsSwarm" json;
ALTER TABLE "application" ADD COLUMN "shmSize" text;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "shmSize" text;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "shmSize" text;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "shmSize" text;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "shmSize" text;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "shmSize" text;
ALTER TABLE "application" DROP CONSTRAINT "application_projectId_project_projectId_fk";
--> statement-breakpoint
ALTER TABLE "compose" DROP CONSTRAINT "compose_projectId_project_projectId_fk";
--> statement-breakpoint
ALTER TABLE "mariadb" DROP CONSTRAINT "mariadb_projectId_project_projectId_fk";
--> statement-breakpoint
ALTER TABLE "mongo" DROP CONSTRAINT "mongo_projectId_project_projectId_fk";
--> statement-breakpoint
ALTER TABLE "mysql" DROP CONSTRAINT "mysql_projectId_project_projectId_fk";
--> statement-breakpoint
ALTER TABLE "postgres" DROP CONSTRAINT "postgres_projectId_project_projectId_fk";
--> statement-breakpoint
ALTER TABLE "redis" DROP CONSTRAINT "redis_projectId_project_projectId_fk";
--> statement-breakpoint
-- ALTER TABLE "mysql" ADD COLUMN "environmentId" text NOT NULL;--> statement-breakpoint
-- ALTER TABLE "mysql" ADD CONSTRAINT "mysql_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" DROP COLUMN "projectId";--> statement-breakpoint
ALTER TABLE "compose" DROP COLUMN "projectId";--> statement-breakpoint
ALTER TABLE "mariadb" DROP COLUMN "projectId";--> statement-breakpoint
ALTER TABLE "mongo" DROP COLUMN "projectId";--> statement-breakpoint
ALTER TABLE "mysql" DROP COLUMN "projectId";--> statement-breakpoint
ALTER TABLE "postgres" DROP COLUMN "projectId";--> statement-breakpoint
ALTER TABLE "redis" DROP COLUMN "projectId";
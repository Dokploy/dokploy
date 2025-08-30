ALTER TABLE "postgres" ADD COLUMN "healthCheckSwarm" json;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "restartPolicySwarm" json;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "placementSwarm" json;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "updateConfigSwarm" json;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "rollbackConfigSwarm" json;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "modeSwarm" json;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "labelsSwarm" json;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "networkSwarm" json;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "replicas" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "healthCheckSwarm" json;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "restartPolicySwarm" json;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "placementSwarm" json;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "updateConfigSwarm" json;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "rollbackConfigSwarm" json;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "modeSwarm" json;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "labelsSwarm" json;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "networkSwarm" json;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "replicas" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "healthCheckSwarm" json;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "restartPolicySwarm" json;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "placementSwarm" json;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "updateConfigSwarm" json;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "rollbackConfigSwarm" json;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "modeSwarm" json;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "labelsSwarm" json;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "networkSwarm" json;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "replicas" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "healthCheckSwarm" json;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "restartPolicySwarm" json;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "placementSwarm" json;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "updateConfigSwarm" json;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "rollbackConfigSwarm" json;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "modeSwarm" json;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "labelsSwarm" json;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "networkSwarm" json;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "replicas" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "healthCheckSwarm" json;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "restartPolicySwarm" json;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "placementSwarm" json;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "updateConfigSwarm" json;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "rollbackConfigSwarm" json;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "modeSwarm" json;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "labelsSwarm" json;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "networkSwarm" json;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "replicas" integer DEFAULT 1 NOT NULL;
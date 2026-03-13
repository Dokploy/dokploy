ALTER TABLE "application" ADD COLUMN "healthCheckSwarm" json;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "restartPolicySwarm" json;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "placementSwarm" json;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "updateConfigSwarm" json;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "rollbackConfigSwarm" json;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "modeSwarm" json;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "labelsSwarm" json;
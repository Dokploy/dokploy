CREATE TYPE "public"."networkDriver" AS ENUM('bridge', 'overlay');--> statement-breakpoint
CREATE TABLE "network" (
	"networkId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"networkName" text NOT NULL,
	"driver" "networkDriver" DEFAULT 'bridge' NOT NULL,
	"subnet" text,
	"gateway" text,
	"ipRange" text,
	"internal" boolean DEFAULT false NOT NULL,
	"encrypted" boolean DEFAULT false NOT NULL,
	"dockerNetworkId" text,
	"createdAt" text NOT NULL,
	"projectId" text,
	"organizationId" text NOT NULL,
	"serverId" text
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "customNetworkIds" text[];--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "customNetworkIds" text[];--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "customNetworkIds" text[];--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "customNetworkIds" text[];--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "customNetworkIds" text[];--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "customNetworkIds" text[];--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "customNetworkIds" text[];--> statement-breakpoint
ALTER TABLE "network" ADD CONSTRAINT "network_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "public"."project"("projectId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network" ADD CONSTRAINT "network_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network" ADD CONSTRAINT "network_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE set null ON UPDATE no action;

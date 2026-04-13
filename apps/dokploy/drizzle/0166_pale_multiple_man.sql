CREATE TYPE "public"."networkDriver" AS ENUM('bridge', 'host', 'overlay', 'macvlan', 'none', 'ipvlan');--> statement-breakpoint
CREATE TABLE "network" (
	"networkId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"driver" "networkDriver" DEFAULT 'bridge' NOT NULL,
	"scope" text,
	"internal" boolean DEFAULT false NOT NULL,
	"attachable" boolean DEFAULT false NOT NULL,
	"ingress" boolean DEFAULT false NOT NULL,
	"configOnly" boolean DEFAULT false NOT NULL,
	"enableIPv4" boolean DEFAULT true NOT NULL,
	"enableIPv6" boolean DEFAULT false NOT NULL,
	"ipam" jsonb DEFAULT '{}'::jsonb,
	"createdAt" text NOT NULL,
	"organizationId" text NOT NULL,
	"serverId" text
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "networkIds" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "networkIds" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "networkIds" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "networkIds" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "networkIds" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "networkIds" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "networkIds" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "network" ADD CONSTRAINT "network_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network" ADD CONSTRAINT "network_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
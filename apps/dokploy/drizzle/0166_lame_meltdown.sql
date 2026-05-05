CREATE TYPE "public"."managedServerPlan" AS ENUM('kvm2', 'kvm4', 'kvm8');--> statement-breakpoint
CREATE TYPE "public"."managedServerStatus" AS ENUM('pending', 'provisioning', 'configuring', 'ready', 'error', 'terminating', 'terminated');--> statement-breakpoint
CREATE TABLE "managed_server" (
	"managedServerId" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"serverId" text,
	"plan" "managedServerPlan" NOT NULL,
	"status" "managedServerStatus" DEFAULT 'pending' NOT NULL,
	"hostingerVmId" integer,
	"hostingerSubscriptionId" text,
	"dataCenterId" integer NOT NULL,
	"ipAddress" text,
	"hostname" text,
	"stripeSubscriptionId" text,
	"stripePriceId" text,
	"rootPassword" text,
	"errorMessage" text,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "managed_server" ADD CONSTRAINT "managed_server_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_server" ADD CONSTRAINT "managed_server_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE set null ON UPDATE no action;
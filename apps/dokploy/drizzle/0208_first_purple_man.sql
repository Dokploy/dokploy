CREATE TYPE "public"."clusterMeshStatus" AS ENUM('provisioning', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."clusterNodeRole" AS ENUM('manager', 'worker');--> statement-breakpoint
CREATE TYPE "public"."clusterNodeStatus" AS ENUM('provisioning', 'paused', 'active', 'drained', 'error', 'removing');--> statement-breakpoint
CREATE TYPE "public"."scalingEventAction" AS ENUM('scale_up', 'scale_down', 'set', 'hold', 'blocked', 'error', 'policy_change');--> statement-breakpoint
CREATE TYPE "public"."scalingEventSource" AS ENUM('manual', 'autoscaler', 'deploy', 'system');--> statement-breakpoint
CREATE TABLE "autoscaler_controller" (
	"controllerId" text PRIMARY KEY NOT NULL,
	"instance" text NOT NULL,
	"version" text,
	"startedAt" timestamp NOT NULL,
	"heartbeatAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autoscaling_policy" (
	"autoscalingPolicyId" text PRIMARY KEY NOT NULL,
	"applicationId" text,
	"composeId" text,
	"serviceName" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"minReplicas" integer DEFAULT 1 NOT NULL,
	"maxReplicas" integer DEFAULT 3 NOT NULL,
	"cpuTargetPercent" integer,
	"memoryTargetPercent" integer,
	"tolerancePercent" integer DEFAULT 10 NOT NULL,
	"evaluationIntervalSeconds" integer DEFAULT 30 NOT NULL,
	"scaleUpWindowSeconds" integer DEFAULT 60 NOT NULL,
	"scaleDownWindowSeconds" integer DEFAULT 300 NOT NULL,
	"cooldownSeconds" integer DEFAULT 60 NOT NULL,
	"maxScaleUpStep" integer DEFAULT 4 NOT NULL,
	"maxScaleDownStep" integer DEFAULT 1 NOT NULL,
	"state" jsonb,
	"lastEvaluatedAt" timestamp,
	"lastScaledAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "autoscaling_policy_single_owner" CHECK (("autoscaling_policy"."applicationId" IS NOT NULL AND "autoscaling_policy"."composeId" IS NULL AND "autoscaling_policy"."serviceName" IS NULL) OR ("autoscaling_policy"."applicationId" IS NULL AND "autoscaling_policy"."composeId" IS NOT NULL AND "autoscaling_policy"."serviceName" IS NOT NULL)),
	CONSTRAINT "autoscaling_policy_replica_range" CHECK ("autoscaling_policy"."minReplicas" >= 1 AND "autoscaling_policy"."maxReplicas" <= 100 AND "autoscaling_policy"."minReplicas" <= "autoscaling_policy"."maxReplicas"),
	CONSTRAINT "autoscaling_policy_target" CHECK ("autoscaling_policy"."cpuTargetPercent" IS NOT NULL OR "autoscaling_policy"."memoryTargetPercent" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "cluster_mesh" (
	"meshId" text PRIMARY KEY NOT NULL,
	"swarmKey" text NOT NULL,
	"organizationId" text NOT NULL,
	"serverId" text,
	"subnet" text DEFAULT '100.96.0.0/24' NOT NULL,
	"listenPort" integer DEFAULT 51820 NOT NULL,
	"wgMtu" integer DEFAULT 1420 NOT NULL,
	"managerAdvertiseAddress" text,
	"status" "clusterMeshStatus" DEFAULT 'provisioning' NOT NULL,
	"lastError" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cluster_mesh_swarmKey_unique" UNIQUE("swarmKey")
);
--> statement-breakpoint
CREATE TABLE "cluster_node" (
	"clusterNodeId" text PRIMARY KEY NOT NULL,
	"meshId" text NOT NULL,
	"name" text NOT NULL,
	"role" "clusterNodeRole" NOT NULL,
	"sshAddress" text NOT NULL,
	"sshPort" integer DEFAULT 22 NOT NULL,
	"sshUser" text DEFAULT 'root' NOT NULL,
	"sshKeyId" text,
	"endpointAddress" text NOT NULL,
	"wgAddress" text NOT NULL,
	"wgPublicKey" text,
	"swarmNodeId" text,
	"status" "clusterNodeStatus" DEFAULT 'provisioning' NOT NULL,
	"lastError" text,
	"log" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compose_service_scaling" (
	"composeId" text NOT NULL,
	"serviceName" text NOT NULL,
	"replicas" integer,
	"placement" jsonb,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "compose_service_scaling_composeId_serviceName_pk" PRIMARY KEY("composeId","serviceName"),
	CONSTRAINT "compose_service_scaling_replicas_range" CHECK ("compose_service_scaling"."replicas" IS NULL OR ("compose_service_scaling"."replicas" >= 1 AND "compose_service_scaling"."replicas" <= 100))
);
--> statement-breakpoint
CREATE TABLE "scaling_event" (
	"scalingEventId" text PRIMARY KEY NOT NULL,
	"applicationId" text,
	"composeId" text,
	"serviceName" text,
	"source" "scalingEventSource" NOT NULL,
	"action" "scalingEventAction" NOT NULL,
	"fromReplicas" integer,
	"toReplicas" integer,
	"reason" text,
	"details" jsonb,
	"userId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scaling_event_single_owner" CHECK (("scaling_event"."applicationId" IS NOT NULL AND "scaling_event"."composeId" IS NULL AND "scaling_event"."serviceName" IS NULL) OR ("scaling_event"."applicationId" IS NULL AND "scaling_event"."composeId" IS NOT NULL AND "scaling_event"."serviceName" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "blueGreenEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "blueGreenEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "autoscaling_policy" ADD CONSTRAINT "autoscaling_policy_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("applicationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoscaling_policy" ADD CONSTRAINT "autoscaling_policy_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_mesh" ADD CONSTRAINT "cluster_mesh_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_mesh" ADD CONSTRAINT "cluster_mesh_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_node" ADD CONSTRAINT "cluster_node_meshId_cluster_mesh_meshId_fk" FOREIGN KEY ("meshId") REFERENCES "public"."cluster_mesh"("meshId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_node" ADD CONSTRAINT "cluster_node_sshKeyId_ssh-key_sshKeyId_fk" FOREIGN KEY ("sshKeyId") REFERENCES "public"."ssh-key"("sshKeyId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compose_service_scaling" ADD CONSTRAINT "compose_service_scaling_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaling_event" ADD CONSTRAINT "scaling_event_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("applicationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaling_event" ADD CONSTRAINT "scaling_event_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaling_event" ADD CONSTRAINT "scaling_event_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "autoscaling_policy_application_idx" ON "autoscaling_policy" USING btree ("applicationId");--> statement-breakpoint
CREATE UNIQUE INDEX "autoscaling_policy_compose_service_idx" ON "autoscaling_policy" USING btree ("composeId","serviceName");--> statement-breakpoint
CREATE UNIQUE INDEX "clusterNode_meshId_wgAddress_idx" ON "cluster_node" USING btree ("meshId","wgAddress");--> statement-breakpoint
CREATE INDEX "scalingEvent_applicationId_createdAt_idx" ON "scaling_event" USING btree ("applicationId","createdAt");--> statement-breakpoint
CREATE INDEX "scalingEvent_composeId_createdAt_idx" ON "scaling_event" USING btree ("composeId","createdAt");
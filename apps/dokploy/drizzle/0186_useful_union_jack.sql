CREATE TABLE "compose_service_resource_profile" (
	"composeServiceId" text PRIMARY KEY NOT NULL,
	"composeId" text NOT NULL,
	"serviceName" text NOT NULL,
	"profileId" text,
	"memoryReservation" text,
	"memoryLimit" text,
	"cpuReservation" text,
	"cpuLimit" text,
	CONSTRAINT "compose_service_unique" UNIQUE("composeId","serviceName")
);
--> statement-breakpoint
CREATE TABLE "resource_group" (
	"groupId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"organizationId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "resource_group_org_name_unique" UNIQUE("organizationId","name")
);
--> statement-breakpoint
CREATE TABLE "resource_profile" (
	"profileId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"memoryReservation" text,
	"memoryLimit" text,
	"cpuReservation" text,
	"cpuLimit" text,
	"groupId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "resource_profile_group_name_unique" UNIQUE("groupId","name")
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "resourceProfileId" text;--> statement-breakpoint
ALTER TABLE "libsql" ADD COLUMN "resourceProfileId" text;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "resourceProfileId" text;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "resourceProfileId" text;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "resourceProfileId" text;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "resourceProfileId" text;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "resourceProfileId" text;--> statement-breakpoint
ALTER TABLE "compose_service_resource_profile" ADD CONSTRAINT "compose_service_resource_profile_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compose_service_resource_profile" ADD CONSTRAINT "compose_service_resource_profile_profileId_resource_profile_profileId_fk" FOREIGN KEY ("profileId") REFERENCES "public"."resource_profile"("profileId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_group" ADD CONSTRAINT "resource_group_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_profile" ADD CONSTRAINT "resource_profile_groupId_resource_group_groupId_fk" FOREIGN KEY ("groupId") REFERENCES "public"."resource_group"("groupId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "composeServiceProfile_profileId_idx" ON "compose_service_resource_profile" USING btree ("profileId");--> statement-breakpoint
CREATE INDEX "resourceProfile_groupId_idx" ON "resource_profile" USING btree ("groupId");--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_resourceProfileId_resource_profile_profileId_fk" FOREIGN KEY ("resourceProfileId") REFERENCES "public"."resource_profile"("profileId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "libsql" ADD CONSTRAINT "libsql_resourceProfileId_resource_profile_profileId_fk" FOREIGN KEY ("resourceProfileId") REFERENCES "public"."resource_profile"("profileId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mariadb" ADD CONSTRAINT "mariadb_resourceProfileId_resource_profile_profileId_fk" FOREIGN KEY ("resourceProfileId") REFERENCES "public"."resource_profile"("profileId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mongo" ADD CONSTRAINT "mongo_resourceProfileId_resource_profile_profileId_fk" FOREIGN KEY ("resourceProfileId") REFERENCES "public"."resource_profile"("profileId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mysql" ADD CONSTRAINT "mysql_resourceProfileId_resource_profile_profileId_fk" FOREIGN KEY ("resourceProfileId") REFERENCES "public"."resource_profile"("profileId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postgres" ADD CONSTRAINT "postgres_resourceProfileId_resource_profile_profileId_fk" FOREIGN KEY ("resourceProfileId") REFERENCES "public"."resource_profile"("profileId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redis" ADD CONSTRAINT "redis_resourceProfileId_resource_profile_profileId_fk" FOREIGN KEY ("resourceProfileId") REFERENCES "public"."resource_profile"("profileId") ON DELETE set null ON UPDATE no action;
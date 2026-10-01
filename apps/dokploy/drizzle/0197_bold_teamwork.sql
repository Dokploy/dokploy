ALTER TABLE "organization" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_team_id" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "canManageDeployments" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"member_count" integer DEFAULT 0 NOT NULL,
	"max_members" integer DEFAULT 50 NOT NULL,
	"organization_id" text NOT NULL,
	"can_create_projects" boolean DEFAULT false NOT NULL,
	"can_access_to_ssh_keys" boolean DEFAULT false NOT NULL,
	"can_create_services" boolean DEFAULT false NOT NULL,
	"can_delete_projects" boolean DEFAULT false NOT NULL,
	"can_delete_services" boolean DEFAULT false NOT NULL,
	"can_access_to_docker" boolean DEFAULT false NOT NULL,
	"can_access_to_api" boolean DEFAULT false NOT NULL,
	"can_access_to_git_providers" boolean DEFAULT false NOT NULL,
	"can_access_to_traefik_files" boolean DEFAULT false NOT NULL,
	"can_delete_environments" boolean DEFAULT false NOT NULL,
	"can_create_environments" boolean DEFAULT false NOT NULL,
	"can_manage_deployments" boolean DEFAULT false NOT NULL,
	"accessed_projects" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"accessed_environments" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"accessed_services" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"accessed_git_providers" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"accessed_servers" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"membership_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_member_membership_key_unique" UNIQUE("membership_key")
);--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_organizationId_idx" ON "team" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "team_name_idx" ON "team" USING btree ("name");--> statement-breakpoint
CREATE INDEX "teamMember_teamId_idx" ON "team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teamMember_userId_idx" ON "team_member" USING btree ("user_id");

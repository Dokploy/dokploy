CREATE TABLE IF NOT EXISTS "team_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"email" text,
	"role" text NOT NULL,
	"token" text NOT NULL,
	"invite_link" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"can_manage_team" boolean DEFAULT false NOT NULL,
	"can_invite_members" boolean DEFAULT false NOT NULL,
	"can_remove_members" boolean DEFAULT false NOT NULL,
	"can_edit_team_settings" boolean DEFAULT false NOT NULL,
	"can_view_team_resources" boolean DEFAULT false NOT NULL,
	"can_manage_team_resources" boolean DEFAULT false NOT NULL,
	"can_create_projects" boolean DEFAULT false NOT NULL,
	"can_create_services" boolean DEFAULT false NOT NULL,
	"can_delete_projects" boolean DEFAULT false NOT NULL,
	"can_delete_services" boolean DEFAULT false NOT NULL,
	"can_access_to_traefik_files" boolean DEFAULT false NOT NULL,
	"can_access_to_docker" boolean DEFAULT false NOT NULL,
	"can_access_to_api" boolean DEFAULT false NOT NULL,
	"can_access_to_ssh_keys" boolean DEFAULT false NOT NULL,
	"can_access_to_git_providers" boolean DEFAULT false NOT NULL,
	"accesed_projects" text[],
	"accesed_services" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"team_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_teams_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("team_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("team_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

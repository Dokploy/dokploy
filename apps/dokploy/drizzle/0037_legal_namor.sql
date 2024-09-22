CREATE TABLE IF NOT EXISTS "server" (
	"serverId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"ipAddress" text NOT NULL,
	"port" integer NOT NULL,
	"username" text DEFAULT 'root' NOT NULL,
	"appName" text NOT NULL,
	"enableDockerCleanup" boolean DEFAULT false NOT NULL,
	"createdAt" text NOT NULL,
	"adminId" text NOT NULL,
	"sshKeyId" text
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "serverId" text;--> statement-breakpoint
ALTER TABLE "postgres" ADD COLUMN "serverId" text;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "serverId" text;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "serverId" text;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "serverId" text;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "serverId" text;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "serverId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "serverId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "server" ADD CONSTRAINT "server_adminId_admin_adminId_fk" FOREIGN KEY ("adminId") REFERENCES "public"."admin"("adminId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "server" ADD CONSTRAINT "server_sshKeyId_ssh-key_sshKeyId_fk" FOREIGN KEY ("sshKeyId") REFERENCES "public"."ssh-key"("sshKeyId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "postgres" ADD CONSTRAINT "postgres_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mariadb" ADD CONSTRAINT "mariadb_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mongo" ADD CONSTRAINT "mongo_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mysql" ADD CONSTRAINT "mysql_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployment" ADD CONSTRAINT "deployment_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redis" ADD CONSTRAINT "redis_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compose" ADD CONSTRAINT "compose_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

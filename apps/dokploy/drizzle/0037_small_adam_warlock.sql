CREATE TABLE IF NOT EXISTS "server" (
	"serverId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"ipAddress" text NOT NULL,
	"port" integer NOT NULL,
	"username" text DEFAULT 'root' NOT NULL,
	"appName" text,
	"createdAt" text NOT NULL,
	"adminId" text NOT NULL,
	CONSTRAINT "server_appName_unique" UNIQUE("appName")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "server" ADD CONSTRAINT "server_adminId_admin_adminId_fk" FOREIGN KEY ("adminId") REFERENCES "public"."admin"("adminId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

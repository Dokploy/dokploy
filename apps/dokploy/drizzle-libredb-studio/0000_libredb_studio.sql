-- Every statement is guarded because a database that ran an earlier build of the integration
-- already has this table: that build applied the same DDL from Dokploy's own migrations folder.
CREATE TABLE IF NOT EXISTS "libredb_studio" (
	"libredbStudioId" text PRIMARY KEY NOT NULL,
	"applicationId" text NOT NULL,
	"allowCustomConnections" boolean DEFAULT false NOT NULL,
	"seedHash" text,
	"lastSyncedAt" text,
	"lastSyncError" text,
	"launchSecret" text NOT NULL,
	"jwtSecret" text NOT NULL,
	"adminPassword" text NOT NULL,
	"createdAt" text NOT NULL,
	CONSTRAINT "libredb_studio_applicationId_unique" UNIQUE("applicationId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "libredb_studio" ADD CONSTRAINT "libredb_studio_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("applicationId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

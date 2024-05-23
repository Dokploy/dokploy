CREATE TABLE IF NOT EXISTS "compose" (
	"composeId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"env" text,
	"composeFile" text NOT NULL,
	"projectId" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compose" ADD CONSTRAINT "compose_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "project"("projectId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "RegistryType" AS ENUM('selfHosted', 'cloud');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registry" (
	"registryId" text PRIMARY KEY NOT NULL,
	"registryName" text NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"registryUrl" text NOT NULL,
	"createdAt" text NOT NULL,
	"selfHosted" "RegistryType" DEFAULT 'cloud' NOT NULL,
	"adminId" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registry" ADD CONSTRAINT "registry_adminId_admin_adminId_fk" FOREIGN KEY ("adminId") REFERENCES "admin"("adminId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

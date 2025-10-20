CREATE TABLE IF NOT EXISTS "ai" (
	"aiId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"apiUrl" text NOT NULL,
	"apiKey" text NOT NULL,
	"model" text NOT NULL,
	"isEnabled" boolean DEFAULT true NOT NULL,
	"adminId" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai" ADD CONSTRAINT "ai_adminId_admin_adminId_fk" FOREIGN KEY ("adminId") REFERENCES "public"."admin"("adminId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

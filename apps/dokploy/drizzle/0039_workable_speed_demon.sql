ALTER TABLE "ssh-key" ADD COLUMN "adminId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ssh-key" ADD CONSTRAINT "ssh-key_adminId_admin_adminId_fk" FOREIGN KEY ("adminId") REFERENCES "public"."admin"("adminId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

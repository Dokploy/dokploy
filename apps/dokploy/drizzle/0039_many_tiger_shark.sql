ALTER TABLE "git_provider" DROP CONSTRAINT "git_provider_authId_auth_id_fk";
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "adminId" text;--> statement-breakpoint
ALTER TABLE "ssh-key" ADD COLUMN "privateKey" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ssh-key" ADD COLUMN "adminId" text;--> statement-breakpoint
ALTER TABLE "git_provider" ADD COLUMN "adminId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_adminId_admin_adminId_fk" FOREIGN KEY ("adminId") REFERENCES "public"."admin"("adminId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ssh-key" ADD CONSTRAINT "ssh-key_adminId_admin_adminId_fk" FOREIGN KEY ("adminId") REFERENCES "public"."admin"("adminId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_adminId_admin_adminId_fk" FOREIGN KEY ("adminId") REFERENCES "public"."admin"("adminId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "git_provider" DROP COLUMN IF EXISTS "authId";
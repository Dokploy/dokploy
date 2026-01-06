ALTER TABLE "certificate" ADD COLUMN "adminId" text;--> statement-breakpoint
ALTER TABLE "certificate" ADD COLUMN "serverId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "certificate" ADD CONSTRAINT "certificate_adminId_admin_adminId_fk" FOREIGN KEY ("adminId") REFERENCES "public"."admin"("adminId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "certificate" ADD CONSTRAINT "certificate_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "server" DROP CONSTRAINT "server_appName_unique";--> statement-breakpoint
ALTER TABLE "server" ALTER COLUMN "appName" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "sshKeyId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "server" ADD CONSTRAINT "server_sshKeyId_ssh-key_sshKeyId_fk" FOREIGN KEY ("sshKeyId") REFERENCES "public"."ssh-key"("sshKeyId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

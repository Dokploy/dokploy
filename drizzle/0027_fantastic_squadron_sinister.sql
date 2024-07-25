ALTER TABLE "compose" ADD COLUMN "customGitSSHKeyId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compose" ADD CONSTRAINT "compose_customGitSSHKeyId_ssh-key_sshKeyId_fk" FOREIGN KEY ("customGitSSHKeyId") REFERENCES "public"."ssh-key"("sshKeyId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "compose" DROP COLUMN IF EXISTS "customGitSSHKey";
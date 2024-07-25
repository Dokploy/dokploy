CREATE TABLE IF NOT EXISTS "ssh-key" (
	"sshKeyId" text PRIMARY KEY NOT NULL,
	"publicKey" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"createdAt" text NOT NULL,
	"lastUsedAt" text
);
--> statement-breakpoint
ALTER TABLE "application" RENAME COLUMN "customGitSSHKey" TO "customGitSSHKeyId";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_customGitSSHKeyId_ssh-key_sshKeyId_fk" FOREIGN KEY ("customGitSSHKeyId") REFERENCES "public"."ssh-key"("sshKeyId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

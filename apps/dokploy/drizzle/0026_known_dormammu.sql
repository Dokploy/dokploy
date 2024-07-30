CREATE TABLE IF NOT EXISTS "ssh-key" (
	"sshKeyId" text PRIMARY KEY NOT NULL,
	"publicKey" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"createdAt" text NOT NULL,
	"lastUsedAt" text
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "customGitSSHKeyId" text;--> statement-breakpoint
ALTER TABLE "compose" ADD COLUMN "customGitSSHKeyId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_customGitSSHKeyId_ssh-key_sshKeyId_fk" FOREIGN KEY ("customGitSSHKeyId") REFERENCES "public"."ssh-key"("sshKeyId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compose" ADD CONSTRAINT "compose_customGitSSHKeyId_ssh-key_sshKeyId_fk" FOREIGN KEY ("customGitSSHKeyId") REFERENCES "public"."ssh-key"("sshKeyId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "application" DROP COLUMN IF EXISTS "customGitSSHKey";--> statement-breakpoint
ALTER TABLE "compose" DROP COLUMN IF EXISTS "customGitSSHKey";
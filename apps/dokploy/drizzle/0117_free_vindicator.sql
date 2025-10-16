CREATE TABLE "gpg-key" (
	"gpgKeyId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"publicKey" text NOT NULL,
	"privateKey" text,
	"passphrase" text,
	"createdAt" text NOT NULL,
	"lastUsedAt" text,
	"organizationId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "gpgPublicKey" text;--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "gpgKeyId" text;--> statement-breakpoint
ALTER TABLE "volume_backup" ADD COLUMN "gpgPublicKey" text;--> statement-breakpoint
ALTER TABLE "volume_backup" ADD COLUMN "gpgKeyId" text;--> statement-breakpoint
ALTER TABLE "gpg-key" ADD CONSTRAINT "gpg-key_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup" ADD CONSTRAINT "backup_gpgKeyId_gpg-key_gpgKeyId_fk" FOREIGN KEY ("gpgKeyId") REFERENCES "public"."gpg-key"("gpgKeyId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_backup" ADD CONSTRAINT "volume_backup_gpgKeyId_gpg-key_gpgKeyId_fk" FOREIGN KEY ("gpgKeyId") REFERENCES "public"."gpg-key"("gpgKeyId") ON DELETE set null ON UPDATE no action;
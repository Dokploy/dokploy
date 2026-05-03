CREATE TABLE "local_server" (
	"localServerId" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"tunnelStatus" "tunnelStatus" DEFAULT 'disabled' NOT NULL,
	"tunnelId" text,
	"tunnelToken" text,
	"tunnelAccountId" text,
	"tunnelError" text,
	"tunnelCheckedAt" text,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_server" ADD CONSTRAINT "local_server_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "local_server_organizationId_unique" ON "local_server" USING btree ("organizationId");
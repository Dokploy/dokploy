CREATE TABLE "ai" (
	"aiId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"apiUrl" text NOT NULL,
	"apiKey" text NOT NULL,
	"model" text NOT NULL,
	"isEnabled" boolean DEFAULT true NOT NULL,
	"organizationId" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai" ADD CONSTRAINT "ai_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
CREATE TYPE "public"."TrustPolicyMode" AS ENUM('keyed', 'keyless');--> statement-breakpoint
CREATE TABLE "trustPolicy" (
	"trustPolicyId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mode" "TrustPolicyMode" NOT NULL,
	"publicKey" text,
	"certificateIdentityRegexp" text,
	"certificateOidcIssuer" text,
	"ignoreTlog" boolean DEFAULT false NOT NULL,
	"cosignImage" text,
	"createdAt" text NOT NULL,
	"organizationId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trustPolicy" ADD CONSTRAINT "trustPolicy_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
-- Migration to support multiple attributes per service link
-- Remove the attribute and envVariableName columns from serviceLink table
ALTER TABLE "serviceLink" DROP COLUMN "attribute";--> statement-breakpoint
ALTER TABLE "serviceLink" DROP COLUMN "envVariableName";--> statement-breakpoint

-- Create the new serviceLinkAttribute table
CREATE TABLE "serviceLinkAttribute" (
	"serviceLinkAttributeId" text PRIMARY KEY NOT NULL,
	"serviceLinkId" text NOT NULL,
	"attribute" "serviceAttribute" NOT NULL,
	"envVariableName" text NOT NULL,
	"createdAt" text NOT NULL
);--> statement-breakpoint

-- Add foreign key constraint
ALTER TABLE "serviceLinkAttribute" ADD CONSTRAINT "serviceLinkAttribute_serviceLinkId_serviceLink_serviceLinkId_fk" FOREIGN KEY ("serviceLinkId") REFERENCES "public"."serviceLink"("serviceLinkId") ON DELETE cascade ON UPDATE no action;
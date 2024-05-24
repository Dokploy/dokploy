ALTER TABLE "deployment" ALTER COLUMN "applicationId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "composeId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployment" ADD CONSTRAINT "deployment_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "compose"("composeId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

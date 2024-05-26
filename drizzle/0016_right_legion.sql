ALTER TYPE "serviceType" ADD VALUE 'compose';--> statement-breakpoint
ALTER TABLE "mount" ADD COLUMN "composeId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mount" ADD CONSTRAINT "mount_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "compose"("composeId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

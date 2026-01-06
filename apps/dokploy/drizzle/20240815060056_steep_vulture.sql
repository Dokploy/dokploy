DO $$ BEGIN
 CREATE TYPE "public"."domainType" AS ENUM('compose', 'application');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "domain" ALTER COLUMN "applicationId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "serviceName" text;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "domainType" "domainType" DEFAULT 'application';--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "composeId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "domain" ADD CONSTRAINT "domain_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

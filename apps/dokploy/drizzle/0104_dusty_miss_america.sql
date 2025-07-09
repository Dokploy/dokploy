ALTER TABLE "organization_role" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "organization_role" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "organization_role" ADD CONSTRAINT "organization_role_name_unique" UNIQUE("name");
ALTER TABLE "destination" ALTER COLUMN "accessKey" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "secretAccessKey" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "bucket" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "region" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "endpoint" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "destinationType" text DEFAULT 's3' NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "ftpHost" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "ftpPort" integer;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "ftpUser" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "ftpPassword" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "ftpBasePath" text;
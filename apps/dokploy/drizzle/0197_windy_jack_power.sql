ALTER TABLE "destination" ALTER COLUMN "accessKey" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "region" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "endpoint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "destinationType" text DEFAULT 's3' NOT NULL;
CREATE TYPE "public"."destination_type" AS ENUM('sftp', 'ftp', 's3');
--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "credentials" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "type" "destination_type" DEFAULT 's3' NOT NULL;
--> statement-breakpoint
UPDATE "destination"
SET "credentials" = jsonb_strip_nulls(
	jsonb_build_object(
		'provider', "provider",
		'accessKey', "accessKey",
		'secretAccessKey', "secretAccessKey",
		'bucket', "bucket",
		'region', "region",
		'endpoint', "endpoint"
	)
);
--> statement-breakpoint
ALTER TABLE "destination" ALTER COLUMN "type" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "destination" DROP COLUMN "provider";
--> statement-breakpoint
ALTER TABLE "destination" DROP COLUMN "accessKey";
--> statement-breakpoint
ALTER TABLE "destination" DROP COLUMN "secretAccessKey";
--> statement-breakpoint
ALTER TABLE "destination" DROP COLUMN "bucket";
--> statement-breakpoint
ALTER TABLE "destination" DROP COLUMN "region";
--> statement-breakpoint
ALTER TABLE "destination" DROP COLUMN "endpoint";

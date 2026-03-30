-- Add destination type support for SFTP and FTP
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "destinationType" text DEFAULT 's3' NOT NULL;
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "host" text;
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "port" text;
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "username" text;
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "password" text;
ALTER TABLE "destination" ADD COLUMN IF NOT EXISTS "remotePath" text;

-- Make S3 fields nullable for non-S3 destinations
ALTER TABLE "destination" ALTER COLUMN "accessKey" DROP NOT NULL;
ALTER TABLE "destination" ALTER COLUMN "secretAccessKey" DROP NOT NULL;
ALTER TABLE "destination" ALTER COLUMN "bucket" DROP NOT NULL;
ALTER TABLE "destination" ALTER COLUMN "region" DROP NOT NULL;
ALTER TABLE "destination" ALTER COLUMN "endpoint" DROP NOT NULL;

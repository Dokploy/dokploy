ALTER TABLE "environment" ADD COLUMN "isDefault" boolean DEFAULT false NOT NULL;

-- Set isDefault to true for existing production environments
UPDATE "environment" SET "isDefault" = true WHERE "name" = 'production';

ALTER TABLE "user_temp" ALTER COLUMN "logCleanupCron" SET DEFAULT '0 0 * * *';

UPDATE "user_temp" SET "logCleanupCron" = '0 0 * * *' WHERE "logCleanupCron" IS NULL;
ALTER TABLE "compose" ADD COLUMN "isolatedDeploymentsVolume" boolean DEFAULT false NOT NULL;

UPDATE "compose" SET "isolatedDeploymentsVolume" = true;
-- Manually add canReadOnlyServices column
ALTER TABLE "member" ADD COLUMN "canReadOnlyServices" boolean DEFAULT false NOT NULL;

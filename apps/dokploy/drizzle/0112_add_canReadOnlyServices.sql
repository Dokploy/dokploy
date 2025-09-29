ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "canReadOnlyServices" boolean DEFAULT false NOT NULL;

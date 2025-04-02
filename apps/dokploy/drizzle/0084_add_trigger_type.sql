-- Add triggerType column to application table
ALTER TABLE "application" ADD COLUMN IF NOT EXISTS "triggerType" text DEFAULT 'push';

-- Add triggerType column to compose table
ALTER TABLE "compose" ADD COLUMN IF NOT EXISTS "triggerType" text DEFAULT 'push';

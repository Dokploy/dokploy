CREATE TABLE IF NOT EXISTS "teams" (
  "teamsId" text PRIMARY KEY NOT NULL,
  "webhookUrl" text NOT NULL,
  "decoration" boolean
);

-- Add the teamsId reference to the notification table if it doesn't exist
ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "teamsId" text REFERENCES "teams"("teamsId") ON DELETE CASCADE;
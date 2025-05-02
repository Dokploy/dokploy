CREATE TABLE IF NOT EXISTS "schedule" (
  "scheduleId" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "cronExpression" text NOT NULL,
  "command" text NOT NULL,
  "applicationId" text NOT NULL REFERENCES "application"("applicationId") ON DELETE CASCADE,
  "createdAt" text NOT NULL
); 
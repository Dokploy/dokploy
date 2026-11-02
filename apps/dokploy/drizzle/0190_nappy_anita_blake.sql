ALTER TABLE "user" ADD COLUMN "onboardingCompletedAt" timestamp;--> statement-breakpoint
-- Backfill only: existing users shouldn't see the onboarding wizard just
-- because this column is new. Not a column-level DEFAULT — that would also
-- apply to rows inserted after this migration, and newly created users
-- (self-hosted setup, cloud signups) need onboardingCompletedAt to stay NULL
-- so the wizard still shows for them.
UPDATE "user" SET "onboardingCompletedAt" = now() WHERE "onboardingCompletedAt" IS NULL;
-- Durable journal of the in-memory deployment queue, so a restart of the Dokploy
-- service re-enqueues waiting/running jobs instead of dropping them. Guarded
-- (IF NOT EXISTS) so a re-run after an upstream-to-fork switch is a no-op.
--
-- The second statement is a re-baseline: schema/snapvisor.ts already declares
-- the "https://api.snapvisor.io" default, but no migration ever carried it.
-- SET DEFAULT is repeatable and only affects rows inserted without a baseUrl.
CREATE TABLE IF NOT EXISTS "deployment_queue_job" (
	"jobId" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"payload" jsonb NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"enqueuedAt" timestamp DEFAULT now() NOT NULL,
	"startedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "snapvisor_integration" ALTER COLUMN "baseUrl" SET DEFAULT 'https://api.snapvisor.io';

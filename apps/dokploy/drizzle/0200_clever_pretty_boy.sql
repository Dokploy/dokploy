ALTER TABLE "user" ADD COLUMN "onboardingStep" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "onboardingReturnEmails" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "trialPlanPromptSubscriptionId" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "serverSetupFailedEmailAt" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "serverConnectFailure" text;
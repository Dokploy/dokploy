CREATE TYPE "public"."failurePolicy" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."qcVerdict" AS ENUM('skipped', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."testExecStatus" AS ENUM('skipped', 'passed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."testPlanStatus" AS ENUM('none', 'generating', 'ready', 'error');--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "qcEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "qcProjectId" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "qcFailurePolicy" "failurePolicy" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "testPlanContent" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "testPlanVersion" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "testPlanStatus" "testPlanStatus" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "testExecEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "testCommand" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "testExecFailurePolicy" "failurePolicy" DEFAULT 'closed' NOT NULL;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "testPlanVersionAtDeploy" integer;--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "qcVerdict" "qcVerdict";--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "testExecStatus" "testExecStatus";--> statement-breakpoint
ALTER TABLE "deployment" ADD COLUMN "testExecExitCode" integer;
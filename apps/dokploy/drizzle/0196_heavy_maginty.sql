ALTER TYPE "public"."deploymentStatus" ADD VALUE 'queued' BEFORE 'running';--> statement-breakpoint
ALTER TYPE "public"."applicationStatus" ADD VALUE 'queued' BEFORE 'running';
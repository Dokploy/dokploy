ALTER TABLE "rollback" ADD COLUMN "fullContext" jsonb;--> statement-breakpoint
ALTER TABLE "rollback" DROP COLUMN "env";
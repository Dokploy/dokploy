ALTER TYPE "public"."scheduleType" ADD VALUE 'dokploy-server';--> statement-breakpoint
ALTER TABLE "schedule" ADD COLUMN "userId" text;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;
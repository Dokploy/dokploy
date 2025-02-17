ALTER TABLE "session_temp" DROP CONSTRAINT "session_temp_user_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "session_temp" ADD CONSTRAINT "session_temp_user_id_user_temp_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;
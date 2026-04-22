ALTER TABLE "session_temp" RENAME TO "session";--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT "session_temp_token_unique";--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT "session_temp_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_token_unique" UNIQUE("token");
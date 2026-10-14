ALTER TABLE "sso_provider" DROP CONSTRAINT "sso_provider_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
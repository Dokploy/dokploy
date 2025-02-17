ALTER TABLE "account" DROP CONSTRAINT "account_user_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "invitation" DROP CONSTRAINT "invitation_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "invitation" DROP CONSTRAINT "invitation_inviter_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "member" DROP CONSTRAINT "member_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "member" DROP CONSTRAINT "member_user_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_owner_id_user_temp_id_fk";
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_temp_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_temp_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_temp_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_owner_id_user_temp_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;
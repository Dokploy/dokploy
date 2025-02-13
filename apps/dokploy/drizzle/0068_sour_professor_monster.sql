ALTER TABLE "project" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "destination" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "certificate" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "registry" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "notification" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "ssh-key" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "git_provider" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "server" RENAME COLUMN "adminId" TO "userId";--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT "project_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "destination" DROP CONSTRAINT "destination_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "certificate" DROP CONSTRAINT "certificate_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "registry" DROP CONSTRAINT "registry_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "ssh-key" DROP CONSTRAINT "ssh-key_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "git_provider" DROP CONSTRAINT "git_provider_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "server" DROP CONSTRAINT "server_adminId_admin_adminId_fk";
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination" ADD CONSTRAINT "destination_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry" ADD CONSTRAINT "registry_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh-key" ADD CONSTRAINT "ssh-key_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_userId_user_temp_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_temp"("id") ON DELETE cascade ON UPDATE no action;
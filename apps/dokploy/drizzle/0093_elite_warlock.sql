ALTER TABLE "git_provider" ADD COLUMN "userId" text NOT NULL;--> statement-breakpoint
ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_userId_account_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."account"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_unique" UNIQUE("user_id");
CREATE TABLE IF NOT EXISTS "user_template_bookmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"templateId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_template_bookmarks_userId_templateId_unique" UNIQUE("userId","templateId")
);
--> statement-breakpoint
ALTER TABLE "user_template_bookmarks" ADD CONSTRAINT "user_template_bookmarks_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
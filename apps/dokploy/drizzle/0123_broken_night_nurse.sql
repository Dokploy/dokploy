CREATE TABLE "user_preferences" (
	"preferenceId" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"hiddenSidebarItems" json DEFAULT '[]'::json,
	"createdAt" text NOT NULL,
	"updatedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
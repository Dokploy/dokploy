CREATE TABLE "patch" (
	"patchId" text PRIMARY KEY NOT NULL,
	"filePath" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"content" text NOT NULL,
	"createdAt" text NOT NULL,
	"updatedAt" text,
	"applicationId" text,
	"composeId" text,
	CONSTRAINT "patch_filepath_application_unique" UNIQUE("filePath","applicationId"),
	CONSTRAINT "patch_filepath_compose_unique" UNIQUE("filePath","composeId")
);
--> statement-breakpoint
ALTER TABLE "patch" ADD CONSTRAINT "patch_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("applicationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patch" ADD CONSTRAINT "patch_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;
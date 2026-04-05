CREATE TABLE "project_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"projectId" text NOT NULL,
	"tagId" text NOT NULL,
	CONSTRAINT "unique_project_tag" UNIQUE("projectId","tagId")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"tagId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"createdAt" text NOT NULL,
	"organizationId" text NOT NULL,
	CONSTRAINT "unique_org_tag_name" UNIQUE("organizationId","name")
);
--> statement-breakpoint
ALTER TABLE "project_tag" ADD CONSTRAINT "project_tag_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "public"."project"("projectId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tag" ADD CONSTRAINT "project_tag_tagId_tag_tagId_fk" FOREIGN KEY ("tagId") REFERENCES "public"."tag"("tagId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
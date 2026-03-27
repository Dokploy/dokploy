CREATE TABLE "notification_to_project" (
	"id" text PRIMARY KEY NOT NULL,
	"notificationId" text NOT NULL,
	"projectId" text NOT NULL,
	CONSTRAINT "unique_notification_project" UNIQUE("notificationId","projectId")
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "scopedToProjects" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_to_project" ADD CONSTRAINT "notification_to_project_notificationId_notification_notificationId_fk" FOREIGN KEY ("notificationId") REFERENCES "public"."notification"("notificationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_to_project" ADD CONSTRAINT "notification_to_project_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "public"."project"("projectId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_to_project_projectId_idx" ON "notification_to_project" USING btree ("projectId");
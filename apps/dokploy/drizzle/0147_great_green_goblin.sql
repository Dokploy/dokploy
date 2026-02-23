CREATE TABLE "activity_log" (
	"activityLogId" text PRIMARY KEY NOT NULL,
	"userId" text,
	"organizationId" text NOT NULL,
	"action" text NOT NULL,
	"resourceType" text NOT NULL,
	"resourceId" text,
	"metadata" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_created_at_idx" ON "activity_log" USING btree ("organizationId","createdAt" DESC NULLS LAST);
CREATE TABLE "webhook_delivery" (
	"deliveryId" text PRIMARY KEY NOT NULL,
	"webhookId" text NOT NULL,
	"event" text NOT NULL,
	"payload" json NOT NULL,
	"statusCode" text,
	"responseTime" text,
	"error" text,
	"attempts" text DEFAULT '1' NOT NULL,
	"deliveredAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook" (
	"webhookId" text PRIMARY KEY NOT NULL,
	"applicationId" text,
	"composeId" text,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"secret" text,
	"templateType" text DEFAULT 'generic' NOT NULL,
	"customTemplate" text,
	"events" json DEFAULT '[]'::json NOT NULL,
	"headers" json DEFAULT '{}'::json,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" text NOT NULL,
	"updatedAt" text
);
--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_webhookId_webhook_webhookId_fk" FOREIGN KEY ("webhookId") REFERENCES "public"."webhook"("webhookId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("applicationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_composeId_compose_composeId_fk" FOREIGN KEY ("composeId") REFERENCES "public"."compose"("composeId") ON DELETE cascade ON UPDATE no action;
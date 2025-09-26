ALTER TYPE "public"."notificationType" ADD VALUE 'custom';--> statement-breakpoint
CREATE TABLE "custom" (
	"customId" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"httpMethod" text DEFAULT 'POST' NOT NULL,
	"headers" text,
	"body" text,
	"queryParams" text
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "customId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_customId_custom_customId_fk" FOREIGN KEY ("customId") REFERENCES "public"."custom"("customId") ON DELETE cascade ON UPDATE no action;
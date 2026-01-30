ALTER TYPE "public"."notificationType" ADD VALUE 'custom' BEFORE 'lark';--> statement-breakpoint
CREATE TABLE "custom" (
	"customId" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"headers" jsonb
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "customId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_customId_custom_customId_fk" FOREIGN KEY ("customId") REFERENCES "public"."custom"("customId") ON DELETE cascade ON UPDATE no action;
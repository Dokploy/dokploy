ALTER TYPE "public"."notificationType" ADD VALUE 'resend' BEFORE 'gotify';--> statement-breakpoint
CREATE TABLE "resend" (
	"resendId" text PRIMARY KEY NOT NULL,
	"apiKey" text NOT NULL,
	"fromAddress" text NOT NULL,
	"toAddress" text[] NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "resendId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_resendId_resend_resendId_fk" FOREIGN KEY ("resendId") REFERENCES "public"."resend"("resendId") ON DELETE cascade ON UPDATE no action;
ALTER TYPE "public"."notificationType" ADD VALUE 'resms';--> statement-breakpoint
CREATE TABLE "resms" (
	"resmsId" text PRIMARY KEY NOT NULL,
	"apiKey" text NOT NULL,
	"phoneNumber" text NOT NULL,
	"senderId" text
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "resmsId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_resmsId_resms_resmsId_fk" FOREIGN KEY ("resmsId") REFERENCES "public"."resms"("resmsId") ON DELETE cascade ON UPDATE no action;
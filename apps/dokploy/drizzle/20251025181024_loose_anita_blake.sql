ALTER TYPE "public"."notificationType" ADD VALUE 'lark';--> statement-breakpoint
CREATE TABLE "lark" (
	"larkId" text PRIMARY KEY NOT NULL,
	"webhookUrl" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "larkId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_larkId_lark_larkId_fk" FOREIGN KEY ("larkId") REFERENCES "public"."lark"("larkId") ON DELETE cascade ON UPDATE no action;
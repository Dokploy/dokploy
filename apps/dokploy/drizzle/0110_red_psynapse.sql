ALTER TYPE "public"."notificationType" ADD VALUE 'ntfy';--> statement-breakpoint
CREATE TABLE "ntfy" (
	"ntfyId" text PRIMARY KEY NOT NULL,
	"serverUrl" text NOT NULL,
	"topic" text NOT NULL,
	"accessToken" text NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "ntfyId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_ntfyId_ntfy_ntfyId_fk" FOREIGN KEY ("ntfyId") REFERENCES "public"."ntfy"("ntfyId") ON DELETE cascade ON UPDATE no action;
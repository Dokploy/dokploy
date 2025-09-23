DO $$ BEGIN
  ALTER TYPE "public"."notificationType" ADD VALUE 'lark';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "lark" (
	"larkId" text PRIMARY KEY NOT NULL,
	"webhookUrl" text NOT NULL
);
ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "larkId" text;
DO $$ BEGIN
  ALTER TABLE "notification" ADD CONSTRAINT "notification_larkId_lark_larkId_fk" FOREIGN KEY ("larkId") REFERENCES "public"."lark"("larkId") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$; 
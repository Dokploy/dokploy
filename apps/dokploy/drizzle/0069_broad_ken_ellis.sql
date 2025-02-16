ALTER TABLE "user_temp" ALTER COLUMN "token" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "user_temp" ADD COLUMN "created_at" timestamp DEFAULT now();
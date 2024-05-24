ALTER TABLE "compose" ALTER COLUMN "composeFile" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "compose" ALTER COLUMN "command" SET DEFAULT '';
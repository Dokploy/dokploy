ALTER TABLE "compose" RENAME COLUMN "gitlabPath" TO "gitlabPathNamespace";--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "gitlabPathNamespace" text;